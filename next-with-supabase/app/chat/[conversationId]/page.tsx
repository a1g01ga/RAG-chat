import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getConversationList, getConversationMessages } from "@/lib/chat/data";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ChatThread } from "@/components/chat/chat-thread";
import { createConversation } from "../actions";

async function ChatConversationContent({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const conversations = await getConversationList(supabase);
  const messages = await getConversationMessages(supabase, conversationId, user.id);

  if (messages === null) {
    redirect("/chat");
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] gap-6">
      <ChatSidebar
        conversations={conversations}
        activeConversationId={conversationId}
        createConversationAction={createConversation}
      />
      <ChatThread
        key={conversationId}
        conversationId={conversationId}
        initialMessages={messages}
      />
    </div>
  );
}

export default function ChatConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">Loading conversation…</p>}
    >
      <ChatConversationContent params={params} />
    </Suspense>
  );
}
