import zoropixel from "../assets/zoro-img-pixel.png";
import moon from "../assets/moon.png";
const About = () => {
  return (
    <div className="h-auto w-full mb-4 border border-dashed border-green-500 p-4">
      <div className="flex gap-2 mb-4">
        <img src={moon} />
        <h1 className="text-xl font-bold text-green-700">ABOUT ME!</h1>
      </div>

      <div className="flex items-start justify-between gap-4">
        <img src={zoropixel} className="h-20 w-20" />
        <p className="font-mono text-sm text-gray-400">
          This is my little portfolio website. I made this on 30th May 2024. I
          am learning how to create websites. I enjoy development. Let&#39;s
          build something great together(
          <a className="text-green-700 font-semibold underline" href="mailto:iamaniksaha.dev@gmail.com">
            mail me
          </a>
          ).
          <br />
          <strong className="text-green-700">Some quick facts:</strong>
        </p>
      </div>

      <ul className="list-disc ml-4 mt-2 font-mono text-sm text-gray-400">
        <li>I am a BTech undergrad.</li>
        <li>I am from Siliguri, India.</li>
        <li>
          I like <span className="text-yellow-500">JavaScript</span>.
        </li>
        <li>
          I love <span className="text-blue-300">Winter</span> and hate{" "}
          <span className="text-red-500">Summer.</span>
        </li>
        <li>I spend most of the time at home on my laptop.</li>
        <li>
          I can code <span className="text-pink-500">Full Stack websites</span>.
        </li>
        <li>
          I have a{" "}
          <span className="text-red-500">goldfish</span> memory.
        </li>
      </ul>
    </div>
  );
};

export default About;
