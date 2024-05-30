const Navbar = () => {
  return (
    <div className="flex items-center justify-between mb-4">
      <h1 className="text-xl font-bold text-green-500 cursor-not-allowed">
        ANIK&#39;S PORTFOLIO
      </h1>
      <a
        href="https://drive.google.com/file/d/1xLjFR1C9Ite6dmxOM7gGnISni2dK8G5I/view"
        target="_blank"
        className="font-bold text-black bg-green-500 py-2 px-3 hover:bg-green-800 hover:text-white"
      >
        Resume
      </a>
    </div>
  );
};

export default Navbar;
