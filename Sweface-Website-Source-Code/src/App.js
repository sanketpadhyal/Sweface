import "./App.css";
import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import Lenis from "lenis";
import Navbar from "./components/Navbar";
import Home from "./components/home";
import About from "./components/About";
import Contact from "./components/Contact";
import StartCompanyLogin from "./components/StartCompanyLogin";
import AdminPanel from "./admin panel/adminpanel";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    if (window.lenis) {
      window.lenis.scrollTo(0, { immediate: true });
    }
  }, [pathname]);

  return null;
}

function isLocalHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function isAdminPath(pathname) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function AdminRoute() {
  useEffect(() => {
    if (!isLocalHost() && !isAdminPath(window.location.pathname)) {
      window.location.replace("https://sweface.netlify.app/admin");
    }
  }, []);

  if (!isLocalHost() && !isAdminPath(window.location.pathname)) {
    return null;
  }

  return <AdminPanel />;
}

function AppContent() {
  const { pathname } = useLocation();
  const hideNavbar = isAdminPath(pathname);

  return (
    <div className="App">
      <main className="app-canvas">
        {!hideNavbar && <Navbar />}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/start-company-login" element={<StartCompanyLogin />} />
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="/login" element={<Home />} />
        </Routes>
      </main>
    </div>
  );
}

function SmoothScrollManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    const isAdminPage = isAdminPath(pathname);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowMemoryDevice = navigator.deviceMemory && navigator.deviceMemory <= 2;

    if (prefersReducedMotion || lowMemoryDevice || isAdminPage) {
      if (window.lenis) {
        window.lenis.destroy();
        window.lenis = null;
      }
      return undefined;
    }

    const lenis = new Lenis({
      duration: 0.85,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothTouch: false,
      touchMultiplier: 1
    });

    window.lenis = lenis;

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      window.lenis = null;
      lenis.destroy();
    };
  }, [pathname]);

  return null;
}

function App() {

  return (
    <Router>
      <SmoothScrollManager />
      <ScrollToTop />
      <AppContent />
    </Router>
  );
}

export default App;
