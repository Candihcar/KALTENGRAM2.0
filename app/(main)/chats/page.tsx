export default function ChatsPage() {
  return (
    <div className="flex-1 flex items-center justify-center text-tg-text-secondary">
      <div className="text-center">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-tg-bg-light flex items-center justify-center">
          <svg className="w-12 h-12 text-tg-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h2 className="text-xl font-medium mb-2">Выберите чат</h2>
        <p className="text-sm">Выберите чат слева или начните новый</p>
      </div>
    </div>
  )
}
