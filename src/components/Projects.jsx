import moon from "../assets/moon.png";
const Projects = () => {
  return (
    <div className="h-auto w-full mb-4 border border-dashed border-green-500 p-4">
      <div className="flex gap-2 mb-4">
        <img src={moon} />
        <h1 className="text-xl font-bold text-green-700">PROJECTS!</h1>
      </div>

      <div className="">
        <div className="ml-2 mb-2">
          <a
            href="https://github.com/anik-saha-2001/book-my-hotel"
            target="_blank"
            className="text-green-700 hover:underline font-bold"
          >
            Hotel Booking Web App
          </a>
          <p className="text-gray-400 text-sm">
            A hotel booking application built with the MERN stack, designed to provide a robust, scalable, 
            and feature-rich experience. This project uses TypeScript for type safety and several advanced tools 
            and libraries for functionality, security, and testing.
          </p>
        </div>
        
        <div className="ml-2 mb-2">
          <a
            href="https://github.com/anik-saha-2001/mern-blog"
            target="_blank"
            className="text-green-700 hover:underline font-bold"
          >
            Blog Web App
          </a>
          <p className="text-gray-400 text-sm">
            Developed a dynamic MERN stack blog app using Tailwind CSS, Firebase
            OAuth, Flowbite, Redux, JWT.
          </p>
        </div>

        <div className="ml-2 mb-2">
          <a
            href="https://github.com/anik-saha-2001/tomato"
            target="_blank"
            className="text-green-700 hover:underline font-bold"
          >
            Food Delivery Website - Frontend
          </a>
          <p className="text-gray-400 text-sm">
            Designed and developed a visually appealing frontend using React for
            a food delivery app with a user-friendly interface and context api
            for state management.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Projects;
