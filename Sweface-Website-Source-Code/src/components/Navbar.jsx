import "./Navbar.css";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logoImg from "../assets/logo.png";
import nameImg from "../assets/name.png";

function ArrowUpRightIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="arrow"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 12L12 4M6 4H12V10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const generateToken = (length = 20) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleRemix = () => {
    const authToken = generateToken(24);
    const sessionToken = generateToken(32);

    sessionStorage.setItem(
      "authSession",
      JSON.stringify({
        auth: authToken,
        sess: sessionToken,
        createdAt: Date.now(),
        expiresAt: Date.now() + 15 * 60 * 1000
      })
    );

    navigate(`/login?auth=${authToken}&sess=${sessionToken}`);
    setOpen(false);
  };

  return (
    <nav className={`navbar ${open ? "expanded" : ""}`}>
      <div className="navbar-container">
        <div className="navbar-header">
          <Link to="/" className="brand" onClick={() => setOpen(false)}>
            <img src={logoImg} alt="SweFace Logo" className="brand-logo" />
            <img src={nameImg} alt="SweFace Name" className="brand-name" />
          </Link>

          {!open ? (
            <div
              className="hamburger"
              onClick={() => setOpen(true)}
              role="button"
              aria-label="Open navigation menu"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setOpen(true);
                }
              }}
            >
              <span />
              <span />
              <span />
            </div>
          ) : (
            <button
              className="btn-close"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <svg
                viewBox="0 0 24 24"
                className="close-icon"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>

        <div className="navbar-menu">
          <ul className="nav-links">

            <li>
              <Link to="/about" onClick={() => setOpen(false)}>
                About
              </Link>
            </li>
            <li>
              <Link to="/contact" onClick={() => setOpen(false)}>
                Contact
              </Link>
            </li>
          </ul>

          <div className="nav-actions">
            <button className="btn-remix" onClick={handleRemix}>
              Download App <ArrowUpRightIcon />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
