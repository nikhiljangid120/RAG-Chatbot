import { MessageSquare, Plus, Trash2 } from 'lucide-react';

export interface Conversation { id: string; title: string; updatedAt: string }
interface Props { conversations: Conversation[]; selectedId: string | null; onSelect: (id: string) => void; onCreate: () => void; onDelete: (id: string) => void }

export function ConversationList({ conversations, selectedId, onSelect, onCreate, onDelete }: Props) {
  return (
    <div className="glass-panel" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Conversations</h3>
        <button title="New conversation" onClick={onCreate} style={{ border: 0, background: 'transparent', color: 'var(--primary)', cursor: 'pointer' }}><Plus size={18} /></button>
      </div>
      <div style={{ display: 'grid', gap: 6, maxHeight: 120, overflow: 'auto' }}>
        {conversations.map((conversation) => (
          <div key={conversation.id} onClick={() => onSelect(conversation.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, cursor: 'pointer', background: selectedId === conversation.id ? 'rgba(99,102,241,.18)' : 'transparent' }}>
            <MessageSquare size={15} /><span title={conversation.title} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '.85rem' }}>{conversation.title}</span>
            <button title="Delete conversation" onClick={(event) => { event.stopPropagation(); onDelete(conversation.id); }} style={{ border: 0, background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
