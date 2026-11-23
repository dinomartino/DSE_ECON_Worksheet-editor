import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SettingsSectionProps } from "@/settings/sections";
import AiSection from "./AiSection";
import { TrialKitBlock, TrialKitBlockView } from "./TrialKitBlock";

const render = () => {
  const props: SettingsSectionProps = {
    env: { desktop: false },
    setCloseGuard: () => {},
  };
  return renderToStaticMarkup(createElement(AiSection, props));
};
const view = (open: boolean, onTurnOff?: () => void) =>
  renderToStaticMarkup(
    createElement(TrialKitBlockView, {
      open,
      onOpen: () => {},
      onClose: () => {},
      onTurnOff,
    }),
  );

describe("Settings → AI: the Question studio trial", () => {
  it("is present while the studio trial is on, with the button and no kit yet", () => {
    const html = render();
    expect(html).toContain("data-studio-trial-block");
    expect(html).toContain("Question studio trial");
    expect(html).toContain("Open the trial kit");
    expect(html).not.toContain("data-studio-trial>");
  });

  it("is absent when the studio trial is off", () => {
    expect(renderToStaticMarkup(createElement(TrialKitBlock, { on: false }))).toBe("");
    expect(renderToStaticMarkup(createElement(TrialKitBlock, { on: true }))).toContain("data-studio-trial-block");
  });

  it("opens the trial kit in a dialog", () => {
    const html = view(true);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("data-studio-trial");
  });

  it("offers Turn the trial off only when given (a release build)", () => {
    expect(view(false)).not.toContain("data-studio-trial-off");
    expect(view(false, () => {})).toContain("Turn the trial off");
  });
});
