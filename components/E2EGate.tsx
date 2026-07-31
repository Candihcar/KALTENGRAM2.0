'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { e2eSetup, e2eUnlock } from '@/lib/e2e'
import { fetchOwnE2E, isE2EUnlocked, restoreE2E, saveE2EKeys } from '@/lib/e2e-store'

export function E2EGate({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const [ready, setReady] = useState(false)
  const [needSetup, setNeedSetup] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (status !== 'authenticated') return
    const userId = session?.user?.id
    if (!userId) return
    let disposed = false
    async function check() {
      if (isE2EUnlocked()) {
        if (!disposed) setReady(true)
        return
      }
      if (await restoreE2E(userId)) {
        if (!disposed) setReady(true)
        return
      }
      const blob = await fetchOwnE2E()
      if (disposed) return
      setNeedSetup(!blob || !blob.pub)
      setReady(true)
    }
    check()
    return () => {
      disposed = true
    }
  }, [status, session?.user?.id])

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      toast.error('E2E-пароль минимум 6 символов')
      return
    }
    if (password !== confirm) {
      toast.error('Пароли не совпадают')
      return
    }
    setBusy(true)
    try {
      const setup = await e2eSetup(password)
      const res = await fetch('/api/e2e/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setup),
      })
      if (!res.ok) throw new Error('save-failed')
      const jwk = await e2eUnlock(password, setup.salt, setup.privEnc)
      await saveE2EKeys(session!.user!.id as string, jwk, setup.pub)
      setPassword('')
      setConfirm('')
      toast.success('Шифрование включено')
    } catch {
      toast.error('Не удалось сохранить ключи')
    } finally {
      setBusy(false)
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return
    setBusy(true)
    try {
      const blob = await fetchOwnE2E()
      if (!blob?.pub || !blob.salt || !blob.privEnc) {
        setNeedSetup(true)
        setBusy(false)
        return
      }
      const jwk = await e2eUnlock(password, blob.salt, blob.privEnc)
      await saveE2EKeys(session!.user!.id as string, jwk, blob.pub)
      setPassword('')
      toast.success('Разблокировано')
    } catch (err: any) {
      toast.error(err?.message === 'wrong-e2e-password' ? 'Неверный E2E-пароль' : 'Ошибка разблокировки')
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    setBusy(true)
    try {
      const setup = await e2eSetup(password)
      const res = await fetch('/api/e2e/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setup),
      })
      if (!res.ok) throw new Error('save-failed')
      const jwk = await e2eUnlock(password, setup.salt, setup.privEnc)
      await saveE2EKeys(session!.user!.id as string, jwk, setup.pub)
      setPassword('')
      setConfirmReset(false)
      toast.success('Новые ключи созданы. Старые переписки недоступны')
    } catch {
      toast.error('Не удалось сбросить ключи')
    } finally {
      setBusy(false)
    }
  }

  if (status !== 'authenticated') return <>{children}</>
  if (!ready || isE2EUnlocked()) return <>{children}</>

  return (
    <>
      {children}
      <div className="fixed inset-0 z-[200] bg-bg-dark/90 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-md card p-8 animate-fade-in">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold">
              {needSetup ? 'Включите шифрование' : 'Разблокируйте переписку'}
            </h2>
            <p className="text-sm text-text-secondary mt-2">
              {needSetup
                ? 'Создайте отдельный E2E-пароль. Сообщения будет видно только участникам чата — сервер хранит их в зашифрованном виде.'
                : 'Введите E2E-пароль, чтобы расшифровать сообщения. Он не связан с паролем от аккаунта.'}
            </p>
          </div>

          {needSetup ? (
            <form onSubmit={handleSetup} className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">E2E-пароль</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Минимум 6 символов"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">Повторите E2E-пароль</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <button type="submit" disabled={busy} className="btn-primary w-full">
                {busy ? 'Создание ключей...' : 'Включить шифрование'}
              </button>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Если вы забудете E2E-пароль, переписка станет недоступной навсегда. Сохраните его надёжно.
              </p>
            </form>
          ) : (
            <form onSubmit={handleUnlock} className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">E2E-пароль</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>
              <button type="submit" disabled={busy} className="btn-primary w-full">
                {busy ? 'Разблокировка...' : 'Разблокировать'}
              </button>
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="w-full text-xs text-text-muted hover:text-danger transition-colors"
                >
                  Забыли E2E-пароль?
                </button>
              ) : (
                <div className="rounded-xl bg-danger/10 border border-danger/30 p-3 space-y-3">
                  <p className="text-xs text-danger">
                    Сброс создаст новые ключи — все старые сообщения станут недоступны навсегда. Задайте новый пароль ниже:
                  </p>
                  <input
                    type="password"
                    className="input"
                    placeholder="Новый E2E-пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={busy || password.length < 6}
                    className="w-full btn-primary bg-danger hover:bg-danger/80 disabled:opacity-50"
                  >
                    Сбросить и создать новые ключи
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="w-full text-xs text-text-muted hover:text-text transition-colors"
                  >
                    Отмена
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </>
  )
}
