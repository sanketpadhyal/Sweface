import React from "react";
import "./Contact.css";
import TrustFooter from "./TrustFooter";
import logoImg from "../assets/logo.png";
import nameImg from "../assets/name.png";

const contactLinks = [
  {
    label: "Website",
    value: "sanketpadhyal.in",
    text: "Personal website and contact details.",
    href: "https://sanketpadhyal.in"
  },
  {
    label: "GitHub",
    value: "github.com/sanketpadhyal",
    text: "Developer profile and public project updates.",
    href: "https://github.com/sanketpadhyal"
  },
  {
    label: "SweFace admin",
    value: "sweface.netlify.app/admin",
    text: "Admin panel access point for SweFace.",
    href: "https://sweface.netlify.app/admin"
  },
  {
    label: "Repository",
    value: "sanketpadhyal/Sweface.git",
    text: "Docs, links, and updates for the app and website.",
    href: "https://github.com/sanketpadhyal/Sweface.git"
  }
];

export default function Contact() {
  return (
    <div className="contact-container">
      <main className="contact-main">
        <section className="contact-intro" aria-labelledby="contact-title">
          <div className="contact-brand">
            <img src={logoImg} alt="SweFace logo" />
            <img src={nameImg} alt="SweFace" />
          </div>

          <p className="contact-eyebrow">Contact</p>
          <h1 id="contact-title">Sanket Padhyal</h1>
          <p className="contact-lead">
            Developer of the SweFace app, website, and admin panel.
          </p>
          <p className="contact-copy">
            Use the links here for the official website, GitHub profile, SweFace admin
            panel, and the repository used for docs, links, and project updates.
          </p>
        </section>

        <section className="contact-links" aria-label="Contact links">
          {contactLinks.map((link) => (
            <a
              className="contact-link"
              href={link.href}
              key={link.href}
              target="_blank"
              rel="noreferrer"
            >
              <span>{link.label}</span>
              <strong>{link.value}</strong>
              <p>{link.text}</p>
            </a>
          ))}
        </section>

        <section className="contact-notes" aria-label="Project notes">
          <div>
            <span>Role</span>
            <strong>App and website developer</strong>
          </div>
          <div>
            <span>Admin panel</span>
            <strong>SweFace management access</strong>
          </div>
          <div>
            <span>Repository</span>
            <strong>Docs, links, and updates</strong>
          </div>
        </section>
      </main>

      <TrustFooter />
    </div>
  );
}
