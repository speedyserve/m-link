'use client';

import { Send, X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/providers';
import { api, ApiError } from '@/lib/api';

const DISMISS_KEY = 'mlink.floatingAssistant.dismissed';

type ChatMessage = { role: 'assistant' | 'user'; text: string };

type AssistantReply = { customerId: string | null; customerName?: string; answer: string };

/** Floating AI launcher, bottom-right of every page — opens a small Q&A panel backed by the RM's own queue data. */
export function FloatingAssistant() {
  const { rmId, locale } = useApp();
  const vi = locale === 'vi';
  const [dismissed, setDismissed] = useState(true);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: vi ? 'Chào bạn! M-Link có thể giúp gì cho bạn?' : 'Hi! How can M-Link help you?' },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === '1'); } catch { setDismissed(false); }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  if (dismissed) return null;

  const closeForever = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode: nothing to persist */ }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setSending(true);
    try {
      const reply = await api<AssistantReply>('/api/dashboard/assistant', rmId, {
        method: 'POST', body: JSON.stringify({ message: text }),
      });
      setMessages((prev) => [...prev, { role: 'assistant', text: reply.answer }]);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : (vi ? 'Có lỗi xảy ra, thử lại nhé.' : 'Something went wrong, try again.');
      setMessages((prev) => [...prev, { role: 'assistant', text: message }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[28rem] w-[22rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-gradient-to-r from-[#c9261a] to-orange-500 px-4 py-3">
            <div className="flex items-center gap-2">
              <Image src="/brand/msb-icon.svg" alt="MSB" width={24} height={24} className="rounded-full bg-white p-0.5"/>
              <div className="text-sm font-extrabold text-white">M-Link</div>
            </div>
            <button type="button" aria-label={vi ? 'Đóng' : 'Close'} onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-full text-white/90 hover:bg-white/15">
              <X size={16}/>
            </button>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto bg-navy-50/40 px-3 py-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug ${m.role === 'user' ? 'bg-orange-500 text-white' : 'border border-navy-100 bg-white text-navy-800'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {sending && <div className="flex justify-start"><div className="rounded-2xl border border-navy-100 bg-white px-3 py-2 text-sm text-navy-400">{vi ? 'Đang tra cứu…' : 'Looking it up…'}</div></div>}
          </div>
          <div className="flex items-center gap-2 border-t border-navy-100 p-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
              placeholder={vi ? 'Hỏi về khách hàng, ví dụ: nên gọi ai trước?' : 'Ask about a customer…'}
              className="field !py-2 text-sm"
            />
            <button type="button" onClick={() => void send()} disabled={sending || !input.trim()} aria-label={vi ? 'Gửi' : 'Send'} className="button !rounded-full !p-2.5 disabled:opacity-40">
              <Send size={16}/>
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <button type="button" aria-label="M-Link" onClick={() => setOpen((v) => !v)} className="floating-assistant">
          <Image src="/brand/msb-icon.svg" alt="" width={34} height={34}/>
        </button>
        {!open && (
          <button type="button" aria-label={vi ? 'Ẩn trợ lý' : 'Hide assistant'} onClick={(e) => { e.stopPropagation(); closeForever(); }} className="floating-assistant-close">
            <X size={12} strokeWidth={3}/>
          </button>
        )}
      </div>
    </div>
  );
}
