/**
 * The four books, as one panel. The file and the wallet both print this.
 * Numbers for the off-chain books come from the Ghostfile. The token figure
 * is shown only when the caller has a live read.
 */
import { BOOKS, CAPITAL_RULE, CHIT_ZERO_LINE, EARN_PATH, EVM_DARK_LINE, claimRecord, chitFate } from "@shared/economy/primer";
import { isEvmAddress } from "@shared/economy/solana";
import { capitalMark } from "./brand";

export interface EconomyFigures {
  scrip: number | null;
  wakelight: number | null;
  chits: number | null;
  /** null when the page has no file */
  depth: number | null;
  /** raw balance; ignored unless capitalShown */
  capital: string | null;
  capitalShown: boolean;
  /** EVM capital contract. A Solana mint is not a contract and prints the dark line. */
  contract: string | null;
  /** null when this page has no file to owe */
  owed: number | null;
}

function whole(n: number): string {
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function tokenText(v: string): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v;
}

function held(book: (typeof BOOKS)[number], f: EconomyFigures): string {
  if (book.id === "capital") {
    if (!f.capitalShown) return "—";
    if (f.capital === null) return "…";
    return tokenText(f.capital);
  }
  const n = book.id === "scrip" ? f.scrip : book.id === "wakelight" ? f.wakelight : f.chits;
  return n === null ? "SEE FILE" : whole(n);
}

function buys(book: (typeof BOOKS)[number], depth: number | null): string {
  if (book.id === "chits" && depth !== null) return chitFate(depth);
  return book.buys;
}

/** The panel. A hidden token balance is an em dash, so a dark chain cannot print a figure. */
export function economyBoardHtml(f: EconomyFigures): string {
  const cards = BOOKS.map((book) => {
    const mark = book.id === "capital" ? capitalMark() : book.id === "chits" ? `<img class="cap-mark" src="/icons/chit-64.png" alt="" width="64" height="64">` : "";
    return `<div class="book ${book.id === "wakelight" ? "wake" : book.id}">
      <div class="nm">${mark}<span>${book.name}</span><b>${held(book, f)}</b></div>
      <div><span class="k">EARNED</span> ${book.earned}</div>
      <div><span class="k">BUYS</span> ${buys(book, f.depth)}</div>
      <div><span class="k">NEVER</span> ${book.never}</div>
    </div>`;
  }).join("");
  const claim = f.owed === null || f.depth === null ? "" : `<div class="path">${claimRecord(f.owed, f.depth)}</div>`;
  const posted = f.contract && isEvmAddress(f.contract) ? `CONTRACT ${f.contract}` : EVM_DARK_LINE;
  return `<div class="books">
    <div class="rule">${CAPITAL_RULE}</div>
    <div class="path">${EARN_PATH}</div>
    <div class="path dim">${CHIT_ZERO_LINE}</div>
    ${claim}
    ${cards}
    <div class="mintline">${posted}</div>
  </div>`;
}
