import moon from "../assets/moon.png";
const Tech = () => {
  return (
    <div className="h-auto w-full mb-4 border border-dashed border-green-500 p-4">
      <div className="flex gap-2 mb-4">
        <img src={moon} />
        <h1 className="text-xl font-bold text-green-700">TECH I HAVE USED!</h1>
      </div>

      <div className="flex flex-wrap justify-start items-start gap-4">
        <p className="bg-yellow-400 px-3 py-2 text-black font-bold">
          JavaScript
        </p>
        <p className="bg-blue-500 px-3 py-2 text-black font-bold">React JS</p>
        <p className="bg-green-700 px-3 py-2 text-black font-bold">
          Express JS
        </p>
        <p className="bg-green-300 px-3 py-2 text-black font-bold">Node JS</p>
        <p className="bg-green-500 px-3 py-2 text-black font-bold">Mongo DB</p>
        <p className="bg-purple-500 px-3 py-2 text-black font-bold">Redux</p>
        <p className="bg-blue-300 px-3 py-2 text-black font-bold">
          Tailwind CSS
        </p>
        <p className="bg-yellow-600 px-3 py-2 text-black font-bold">Firebase</p>
        <p className="bg-orange-500 px-3 py-2 text-black font-bold">Git</p>
      </div>
    </div>
  );
};

export default Tech;
