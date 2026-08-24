'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function TenantNoticesPage() {
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotices = async () => {
    try {
      setLoading(true);
      const data = await api.get('/notices/active');
      setNotices(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotices();
  }, []);

  return (
    <div className="space-y-5 text-xs">
      <div className="pb-3 border-b border-slate-200">
        <h2 className="text-base font-bold text-slate-900">House Notice Board</h2>
        <p className="text-xs text-slate-500">Announcements, water schedule updates, and notifications</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400 text-xs">
          Loading notices...
        </div>
      ) : notices.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-slate-500 shadow-sm">
          <p className="font-semibold text-slate-900">No active house notices</p>
          <p className="text-xs text-slate-400 mt-1">
            When the house owner posts announcements or updates, they will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <div
              key={n.id}
              className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-slate-900">{n.title}</span>
                  <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-medium">
                    {n.category || 'General'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono shrink-0">{n.createdDateBS}</span>
              </div>

              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                {n.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
