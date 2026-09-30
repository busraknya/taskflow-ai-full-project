'use client';

interface Member {
  id: string;
  role: string;
  status: string;
  user: {
    id: string;
    fullName: string;
    email: string;
  };
}

interface MemberListTableProps {
  members: Member[];
  onRoleChange: (membershipId: string, newRole: string) => void;
  onRemove: (membershipId: string) => void;
  isOwnerOrAdmin: boolean;
}

export function MemberListTable({ members, onRoleChange, onRemove, isOwnerOrAdmin }: MemberListTableProps) {
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/20">
      <table className="w-full text-left text-xs">
        <thead className="bg-zinc-900/50 border-b border-zinc-800 text-zinc-400 uppercase font-mono text-[10px]">
          <tr>
            <th className="p-3">Name</th>
            <th className="p-3">Email</th>
            <th className="p-3">Role</th>
            <th className="p-3">Status</th>
            {isOwnerOrAdmin && <th className="p-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {members.map((m) => (
            <tr key={m.id} className="hover:bg-zinc-900/30 transition-colors">
              <td className="p-3 font-medium text-white">{m.user.fullName}</td>
              <td className="p-3 text-zinc-400">{m.user.email}</td>
              <td className="p-3">
                {isOwnerOrAdmin ? (
                  <select
                    value={m.role}
                    onChange={(e) => onRoleChange(m.id, e.target.value)}
                    className="bg-zinc-800 text-zinc-200 font-mono px-2 py-1 rounded text-[10px] uppercase border border-zinc-700 focus:outline-none cursor-pointer"
                  >
                    <option value="OWNER">Owner</option>
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                ) : (
                  <span className="bg-zinc-800 text-zinc-300 font-mono px-2 py-0.5 rounded text-[10px] uppercase">
                    {m.role}
                  </span>
                )}
              </td>
              <td className="p-3">
                <span className="text-emerald-400 font-mono text-[10px]">● {m.status}</span>
              </td>
              {isOwnerOrAdmin && (
                <td className="p-3 text-right">
                  <button
                    onClick={() => onRemove(m.id)}
                    className="text-red-400 hover:text-red-300 transition-colors font-medium text-[11px] underline"
                  >
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}