import { StatusBadge } from "./ui";

const rails = [
  ["Intent", "Agent requests verified market research", "BOUND"],
  ["Mandate", "₹500 maximum · approval above ₹350", "ACTIVE"],
  ["Policy", "Amount, merchant, service and rail checked", "ALLOW"],
  ["Payment", "Razorpay order created only after reserve", "CONTROLLED"],
  ["Evidence", "Signed chain is portable and tamper-evident", "VERIFIED"],
] as const;

export function AuthorityBoard() {
  return (
    <section aria-labelledby="reference-authority-chain" className="authority-board">
      <div className="board-head">
        <h2 id="reference-authority-chain">Authority chain</h2>
        <span className="reference-label">Example · ₹299 path</span>
      </div>
      <ol className="authority-list">
        {rails.map(([title, body, state], index) => (
          <li className="authority-row" key={title}>
            <span aria-hidden="true" className="authority-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
            <StatusBadge status={state} />
          </li>
        ))}
      </ol>
    </section>
  );
}
