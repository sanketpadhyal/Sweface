import React from "react";
import { Link } from "react-router-dom";
import "./TrustFooter.css";
import logoImg from "../assets/logo.png";
import nameImg from "../assets/name.png";
import officeBuildingIcon from "../assets/office-building.png";

export default function TrustFooter() {
  return (
    <section className="footer-wrap" id="contact">
      <div className="final-cta">
        <p className="footer-kicker">Ready for attendance without friction?</p>
        <h2>Bring SweFace to your company kiosk, front desk, or field team.</h2>
        <Link className="final-button" to="/start-company-login">
          Start company login
          <img src={officeBuildingIcon} alt="" className="company-login-icon" />
        </Link>
      </div>
      <footer className="site-footer">
        <div className="footer-brand">
          <img src={logoImg} alt="SweFace logo" />
          <img src={nameImg} alt="SweFace" />
        </div>
        <div className="footer-links">

          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
        </div>
        <p>Built for face attendance, offline sync, and company sessions.</p>
      </footer>
    </section>
  );
}
