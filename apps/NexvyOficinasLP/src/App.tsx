import { Cta } from "./components/Cta";
import { FAQ } from "./components/FAQ";
import { Features } from "./components/Features";
import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { Navbar } from "./components/Navbar";
import { Pricing } from "./components/Pricing";
import { ScrollToTop } from "./components/ScrollToTop";
import "./App.css";

function App() {
  return (
    <>
      <Navbar />
      <Hero />
      <Features />
      <Pricing />
      <Cta />
      <FAQ />
      <Footer />
      <ScrollToTop />
    </>
  );
}

export default App;
