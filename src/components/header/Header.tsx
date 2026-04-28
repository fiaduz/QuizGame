import dp from '../../assets/dp.jpeg'

function Header() {
  return (
    <nav className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 shadow-md border-b sticky top-0 z-50">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
        
        {/* Left */}
        <div className="flex items-center gap-3">
          <img 
            className="w-11 h-11 rounded-full border border-2 border-white object-cover"
            src={dp} 
            alt="profile" 
          />
          <p className="!text-gray-300 text-sm font-semibold tracking-wide  ">
            Do You Know Me Well?
          </p>
        </div>

        {/* Right */}
        <button className="bg-gray-700 text-gray-200 px-4 py-1.5 rounded-full text-sm hover:bg-gray-600 transition">
          Play Quiz
        </button>

      </div>
    </nav>
  )
}

export default Header