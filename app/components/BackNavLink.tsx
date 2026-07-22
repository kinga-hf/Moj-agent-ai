"use client";

export function BackNavLink() {
  function handleBack(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = "/";
  }

  return (
    <a className="nav-link primary" href="/" onClick={handleBack}>
      Powrót
    </a>
  );
}
