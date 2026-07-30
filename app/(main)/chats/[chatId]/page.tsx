import { ChatView } from '@/components/Chat/ChatView'

export default function ChatPage({ params }: { params: { chatId: string } }) {
  return <ChatView chatId={params.chatId} />
}
