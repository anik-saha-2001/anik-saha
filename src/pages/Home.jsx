import About from "../components/About";
import Footer from "../components/Footer";
import Links from "../components/Links";
import Navbar from "../components/Navbar";
import Projects from "../components/Projects";
import Tech from "../components/Tech";

const Home = () => {
  return (
    <div className="min-h-screen w-[640px] p-4">
      <Navbar />
      <About />
      <Tech />
      <Projects />
      <Links />
      <Footer />
    </div>
  );
};

export default Home;
