import { useState } from "react";
import FaceLivenessSimulator from "./FaceLivenessSimulator";
import LoginFlowSimulator from "./LoginFlowSimulator";
import "./App.css";

export default function App() {
  const [tab, setTab] = useState("login");

  return (
    <div className={tab === "login" ? "app-root app-root--activation" : "app-root"}>
      <nav className="app-tabs app-tabs--center" aria-label="Lab tools">
        <button
          type="button"
          className={tab === "login" ? "app-tabs__btn app-tabs__btn--active" : "app-tabs__btn"}
          onClick={() => setTab("login")}
        >
          Nafath
        </button>
        <button
          type="button"
          className={tab === "face" ? "app-tabs__btn app-tabs__btn--active" : "app-tabs__btn"}
          onClick={() => setTab("face")}
        >
          Face
        </button>
      </nav>
      {tab === "login" ? (
        <LoginFlowSimulator />
      ) : (
        <FaceLivenessSimulator />
      )}
    </div>
  );
}
