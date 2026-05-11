interface TopbarProps {
    title: string;
    userName: string;
  }
  
  export default function Topbar({ title, userName }: TopbarProps) {
    return (
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="text-sm font-bold text-gray-800">{title}</div>
        <div className="flex items-center gap-2.5">
          <span className="text-sm text-gray-500">{userName}</span>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{backgroundColor: '#6bb100'}}>
            {userName.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>
    );
  }