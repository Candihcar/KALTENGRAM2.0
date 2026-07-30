import { User, Chat, ChatMember, Message, Call } from '@prisma/client'

export type SafeUser = Omit<User, 'passwordHash'>

export interface ChatWithUsers extends Chat {
  members: (ChatMember & { user: SafeUser })[]
  messages: (Message & { sender: SafeUser })[]
}

export interface MessageWithSender extends Message {
  sender: SafeUser
}
