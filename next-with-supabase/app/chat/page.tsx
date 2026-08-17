import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getConversationList, getConversationMessages } from "@/lib/chat/data";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ChatThread } from "@/components/chat/chat-thread";
import { createConversation } from "./actions";

async function ChatPageContent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const conversations = await getConversationList(supabase);

  if (conversations.length === 0) {
    return (
      <div className="flex h-[calc(100vh-10rem)] gap-6">
        <ChatSidebar
          conversations={conversations}
          activeConversationId={null}
          createConversationAction={createConversation}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-muted-foreground max-w-xs">
              Start a new conversation to ask about the safety guides.
            </p>
            <form action={createConversation}>
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start a new conversation
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const activeConversationId = conversations[0].id;
  const messages = (await getConversationMessages(supabase, activeConversationId, user.id)) ?? [];

  return (
    <div className="flex h-[calc(100vh-10rem)] gap-6">
      <ChatSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        createConversationAction={createConversation}
      />
      <ChatThread
        key={activeConversationId}
        conversationId={activeConversationId}
        initialMessages={messages}
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">Loading conversations…</p>}
    >
      <ChatPageContent />
    </Suspense>
  );
}
