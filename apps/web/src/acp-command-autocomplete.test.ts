import { describe, expect, it } from "vitest";
import {
  type AcpCommandSuggestion,
  commandMatchScore,
  filterAcpCommands,
  filterAcpSuggestions,
  insertAcpCommand,
  matchAcpCommandToken,
  moveAcpCommandIndex,
} from "./acp-command-autocomplete";

const commands = [
  { name: "review", description: "Review changes" },
  { name: "refactor", description: "Refactor code" },
  { name: "ship", description: "Ship it" },
];

const opsxCommands = [
  { name: "opsx-apply", description: "Apply change" },
  { name: "opsx-explore", description: "Explore" },
  { name: "opsx-propose", description: "Propose" },
];

describe("ACP command autocomplete", () => {
  it("matches a bare or partial command at the start and after whitespace", () => {
    expect(matchAcpCommandToken("/", 1)).toEqual({ query: "", start: 0, end: 1 });
    expect(matchAcpCommandToken("Review /rev", 11)).toEqual({ query: "rev", start: 7, end: 11 });
    expect(matchAcpCommandToken("Review /rev later", 11)).toEqual({ query: "rev", start: 7, end: 11 });
  });

  it("does not match embedded slash text or a token after whitespace", () => {
    expect(matchAcpCommandToken("path/to", 7)).toBeUndefined();
    expect(matchAcpCommandToken("/review ", 8)).toBeUndefined();
  });

  it("scores command matches by tier with minimum query-length gates", () => {
    expect(commandMatchScore("opsx-apply", "")).toBe(0);
    expect(commandMatchScore("opsx-apply", "opsx")).toBe(1);
    expect(commandMatchScore("opsx-apply", "apply")).toBe(2);
    expect(commandMatchScore("opsx-explore", "plore")).toBe(3);
    expect(commandMatchScore("opsx-propose", "opose")).toBe(3);
    expect(commandMatchScore("opsx-propose", "prpse")).toBe(4);
    expect(commandMatchScore("opsx-apply", "xy")).toBe(-1);
    expect(commandMatchScore("opsx-explore", "pl")).toBe(-1);
    expect(commandMatchScore("opsx-explore", "plo")).toBe(3);
    expect(commandMatchScore("opsx-propose", "rps")).toBe(-1);
  });

  it("filters command names by ranked match quality and handles no commands", () => {
    expect(filterAcpCommands(commands, "RE").map((command) => command.name)).toEqual(["refactor", "review"]);
    expect(filterAcpCommands(commands, "x")).toEqual([]);
    expect(filterAcpCommands([], "")).toEqual([]);
    expect(filterAcpCommands(opsxCommands, "apply").map((command) => command.name)).toEqual(["opsx-apply"]);
    expect(filterAcpCommands(opsxCommands, "plore").map((command) => command.name)).toEqual(["opsx-explore"]);
    expect(filterAcpCommands(opsxCommands, "opose").map((command) => command.name)).toEqual(["opsx-propose"]);
    expect(filterAcpCommands(opsxCommands, "prpse").map((command) => command.name)).toEqual(["opsx-propose"]);
  });

  it("lists the client session command alongside matching provider commands", () => {
    const suggestions = filterAcpSuggestions(commands, "");
    expect(suggestions[0]).toEqual({ kind: "client", command: { kind: "new", name: "new", description: expect.any(String) } });
    expect(suggestions.map((suggestion) => suggestion.command.name)).toEqual(["new", "refactor", "review", "ship"]);
    expect(filterAcpSuggestions(commands, "RE").map((suggestion) => suggestion.command.name)).toEqual(["refactor", "review"]);
    expect(filterAcpSuggestions(commands, "n").map((suggestion) => suggestion.command.name)).toEqual(["new"]);
    expect(filterAcpSuggestions(commands, "sh").map((suggestion) => suggestion.kind)).toEqual(["provider"]);
    expect(filterAcpSuggestions([], "x")).toEqual([]);
    expect(filterAcpSuggestions(opsxCommands, "apply").map((suggestion) => suggestion.command.name)).toEqual(["opsx-apply"]);
    expect(filterAcpSuggestions(opsxCommands, "plore").map((suggestion) => suggestion.command.name)).toEqual(["opsx-explore"]);
    expect(filterAcpSuggestions(opsxCommands, "opose").map((suggestion) => suggestion.command.name)).toEqual(["opsx-propose"]);
    expect(filterAcpSuggestions(opsxCommands, "prpse").map((suggestion) => suggestion.command.name)).toEqual(["opsx-propose"]);
  });

  it("ranks stronger provider matches ahead of weaker ones and breaks ties deterministically", () => {
    expect(filterAcpSuggestions(opsxCommands, "opsx").map((suggestion) => suggestion.command.name)).toEqual([
      "opsx-apply",
      "opsx-explore",
      "opsx-propose",
    ]);
    expect(filterAcpSuggestions([{ name: "explore", description: "Short name" }, ...opsxCommands], "explore").map((suggestion) => suggestion.command.name)).toEqual([
      "explore",
      "opsx-explore",
    ]);
  });

  it("keeps client and provider suggestions distinguishable for execution vs insertion", () => {
    const suggestions: AcpCommandSuggestion[] = filterAcpSuggestions([{ name: "new", description: "A provider command named new" }], "");
    expect(suggestions.filter((suggestion) => suggestion.kind === "client")).toHaveLength(1);
    expect(suggestions.filter((suggestion) => suggestion.kind === "provider")).toHaveLength(1);
  });

  it("wraps keyboard selection and leaves an empty list safely at zero", () => {
    expect(moveAcpCommandIndex(0, -1, 3)).toBe(2);
    expect(moveAcpCommandIndex(2, 1, 3)).toBe(0);
    expect(moveAcpCommandIndex(2, 1, 0)).toBe(0);
  });

  it("inserts the selected command while preserving surrounding text", () => {
    const match = matchAcpCommandToken("before /rev after", 11);
    expect(match).toBeDefined();
    expect(insertAcpCommand("before /rev after", match!, commands[0]!)).toEqual({ text: "before /review  after", caret: 15 });
  });
});
