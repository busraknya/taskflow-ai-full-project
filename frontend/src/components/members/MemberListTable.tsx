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
}

export function MemberListTable({ members }: MemberListTableProps) {
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/20">
      <table className="w-full text-left text-xs">
        <thead className="bg-zinc-900/50 border-b border-zinc-800 text-zinc-400 uppercase font-mono text-[10px]">
          <tr>
            <th className="p-3">Name</th>
            <th className="p-3">Email</th>
            <th className="p-3">Role</th>
            <th className="p-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {members.map((m) => (
            <tr key={m.id} className="hover:bg-zinc-900/30 transition-colors">
              <td className="p-3 font-medium text-white">{m.user.fullName}</td>
              <td className="p-3 text-zinc-400">{m.user.email}</td>
              <td className="p-3">
                <span className="bg-zinc-800 text-zinc-300 font-mono px-2 py-0.5 rounded text-[10px] uppercase">
                  {m.role}
                </span>
              </td>
              <td className="p-3">
                <span className="text-emerald-400 font-mono text-[10px]">● {m.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}