import "./style.css";
import { NewAxisCrystalApp } from "./crystal/NewAxisCrystalApp";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root");

const app = new NewAxisCrystalApp(root);

declare global {
  interface Window {
    __newAxisCrystal?: {
      inspect(): object;
      setLook(id: "clear" | "prism" | "smoked"): void;
      exportPng(): Promise<void>;
    };
  }
}

window.__newAxisCrystal = {
  inspect: () => app.inspect(),
  setLook: (id) => app.setLook(id),
  exportPng: () => app.exportPng(),
};
