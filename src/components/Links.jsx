import zorosmile from "../assets/zoro-smile.gif";
import { IoMdMail } from "react-icons/io";
import { FaGithub, FaLinkedin } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";

const Links = () => {
  return (
    <div className="h-auto w-full mb-4 border border-dashed border-green-500 p-4 px-6">
      <div className="flex items-center justify-between">
        <img src={zorosmile} className="h-28 w-24" />

        <div className="flex gap-6">
          <a href="mailto:iamaniksaha.dev@gmail.com">
            <IoMdMail />
          </a>
          <a href="https://twitter.com/iamanikdev" target="_blank">
            <FaXTwitter />
          </a>
          <a href="https://github.com/anik-saha-2001" target="_blank">
            <FaGithub />
          </a>
          <a href="https://www.linkedin.com/in/aniksaha2001/" target="_blank">
            <FaLinkedin />
          </a>
        </div>
      </div>
    </div>
  );
};

export default Links;
