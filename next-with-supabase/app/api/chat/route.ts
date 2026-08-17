import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createChatCompletion, createEmbedding, rewriteRetrievalQuery, type ChatMessage } from "@/lib/ai/openrouter";
import { getOwnedConversation, isValidUuid } from "@/lib/chat/data";

const MATCH_THRESHOLD = 0.5;
const MATCH_COUNT = 5;

const SYSTEM_PROMPT = `You are a support assistant inside a safety-guide app for people affected by (cyber)stalking. Be calm, clear, and practical.

- If the user's request is ambiguous (for example, the device type or the specific problem is unclear), ask a short clarifying question before answering.
- When guide excerpts are provided below, ground your answer in them and stay consistent with their instructions.
- When no guide excerpts are provided, say plainly that nothing relevant was found in the guide library for this question, and stop there. Do not answer from general knowledge, and do not claim to have checked the web.`;

const RETRIEVAL_UNAVAILABLE_NOTE = `\n\nGuide retrieval is temporarily unavailable for this reply (a technical error, not a search result). Say plainly that you weren't able to search the guide library just now and suggest the user try again in a moment. Do not say that nothing relevant exists in the library — that has not been checked.`;

interface MatchDocumentRow {
  id: number;
  guide_id: string;
  content: string;
  similarity: number;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const conversationId = body?.conversationId;
  const message = body?.message;

  if (
    typeof conversationId !== "string" ||
    typeof message !== "string" ||
    !message.trim()
  ) {
    return NextResponse.json(
      { error: "conversationId and message are required" },
      { status: 400 },
    );
  }

  if (!isValidUuid(conversationId)) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const conversation = await getOwnedConversation(supabase, conversationId, user.id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: priorMessages, error: priorMessagesError } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (priorMessagesError) throw priorMessagesError;

  // Save the user's message before any AI call, so it's never lost if a
  // later step fails.
  const { error: insertUserMessageError } = await supabase
    .from("chat_messages")
    .insert({ conversation_id: conversationId, role: "user", content: message });
  if (insertUserMessageError) throw insertUserMessageError;

  const priorChatMessages = priorMessages.map((row) => ({
    role: row.role as "user" | "assistant",
    content: row.content,
  }));

  let relatedGuides: { id: string; slug: string; title: string }[] = [];
  let contextBlock = "";
  let retrievalFailed = false;
  try {
    let retrievalQuery = message;
    if (priorMessages.length > 0) {
      try {
        retrievalQuery = await rewriteRetrievalQuery(priorChatMessages, message);
      } catch (err) {
        console.error("Query rewrite failed, falling back to raw message:", err);
      }
    }

    const embedding = await createEmbedding(retrievalQuery);
    const { data: matches, error: matchError } = await supabase.rpc("match_documents", {
      query_embedding: embedding,
      match_threshold: MATCH_THRESHOLD,
      match_count: MATCH_COUNT,
    });
    if (matchError) throw matchError;

    const matchRows = (matches ?? []) as MatchDocumentRow[];
    if (matchRows.length > 0) {
      const guideIds = [...new Set(matchRows.map((row) => row.guide_id))];
      const { data: guides, error: guidesError } = await supabase
        .from("guides")
        .select("id, slug, title")
        .in("id", guideIds);
      if (guidesError) throw guidesError;

      relatedGuides = guides ?? [];
      contextBlock = matchRows
        .map((row, index) => `[Excerpt ${index + 1}]\n${row.content}`)
        .join("\n\n");
    }
  } catch (err) {
    // Degrade gracefully: proceed without retrieved context rather than
    // blocking the reply entirely. Track that retrieval itself broke (as
    // opposed to genuinely finding nothing) so the prompt below can tell
    // the model to say retrieval is unavailable rather than claiming
    // nothing relevant exists in the library.
    console.error("Retrieval failed, proceeding without context:", err);
    retrievalFailed = true;
  }

  const chatMessages: ChatMessage[] = [
    {
      role: "system",
      content: contextBlock
        ? `${SYSTEM_PROMPT}\n\nRetrieved guide excerpts:\n${contextBlock}`
        : retrievalFailed
          ? `${SYSTEM_PROMPT}${RETRIEVAL_UNAVAILABLE_NOTE}`
          : SYSTEM_PROMPT,
    },
    ...priorChatMessages,
    { role: "user", content: message },
  ];

  let assistantReply: string;
  try {
    assistantReply = await createChatCompletion(chatMessages);
  } catch (err) {
    console.error("Chat completion failed:", err);
    return NextResponse.json(
      { error: "Failed to get a response. Your message was saved — you can retry." },
      { status: 502 },
    );
  }

  const { data: assistantMessage, error: insertAssistantError } = await supabase
    .from("chat_messages")
    .insert({ conversation_id: conversationId, role: "assistant", content: assistantReply })
    .select("id, role, content, created_at")
    .single();
  if (insertAssistantError) throw insertAssistantError;

  const isFirstMessage = conversation.title === "New conversation" && priorMessages.length === 0;
  const updates: { updated_at: string; title?: string } = {
    updated_at: new Date().toISOString(),
  };
  if (isFirstMessage) {
    updates.title = message.slice(0, 40);
  }
  const { error: updateError } = await supabase
    .from("chat_conversations")
    .update(updates)
    .eq("id", conversationId);
  if (updateError) throw updateError;

  return NextResponse.json({
    message: {
      id: assistantMessage.id,
      role: assistantMessage.role,
      content: assistantMessage.content,
      createdAt: assistantMessage.created_at,
    },
    relatedGuides,
  });
}
