// Special Classic Body Class Toggles
(function setupLegacyStyles() {
  const code = [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "b",
    "a",
    "Enter",
  ];
  let buffer = [];
  window.addEventListener("keydown", function onKey(e) {
    try {
      // ignore input elements so normal typing isn't disrupted
      const tag =
        e.target && e.target.tagName ? e.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || e.target.isContentEditable)
        return;
      buffer.push(e.key);
      if (buffer.length > code.length) buffer.shift();
      // debug: log the pressed key and current buffer
      console.debug("[legacyStyle] key:", e.key, "buffer:", buffer.join(","));
      if (
        buffer.length === code.length &&
        buffer.every((v, i) => v === code[i])
      ) {
        try {
          console.info("[legacyStyle] sequence matched — cycling retro themes");
          const hasWin = document.body.classList.contains("win31");
          const hasDos = document.body.classList.contains("dos");
          let msg = "";
          // cycle: none -> win31 -> dos -> none
          if (!hasWin && !hasDos) {
            // enable Win3.1-only theme (do NOT load monitor.css)
            document.body.classList.add("win31");
            msg = "Windows 3.1 theme enabled";
          } else if (hasWin && !hasDos) {
            // swap Win3.1 -> DOS and load monitor.css for DOS visuals
            document.body.classList.remove("win31");
            document.body.classList.add("dos");
            ensureMonitorCss();
            msg = "DOS theme enabled";
          } else {
            // was DOS (or both) -> clear retro themes and unload monitor.css
            document.body.classList.remove("win31");
            document.body.classList.remove("dos");
            removeMonitorCss();
            msg = "Retro themes disabled";
          }
          // After a successful theme toggle, scroll to top so users see the updated theme immediately
          try {
            window.scrollTo && window.scrollTo({top: 0, behavior: "smooth"});
          } catch (e) {
            /* ignore */
          }
          // show a small toast that auto-removes
          const id = "win31-toast";
          if (!document.getElementById(id)) {
            const t = document.createElement("div");
            t.id = id;
            t.textContent = msg;
            document.body.appendChild(t);
            setTimeout(() => {
              const el = document.getElementById(id);
              if (el) el.remove();
            }, 2600);
          }
          // clear buffer to avoid repeated toggles
          buffer = [];
        } catch (err) {
          console.error("[legacyStyle] theme cycle error", err);
        }
      }
    } catch (err) {
      console.error("[legacyStyle] handler error", err);
    }
  });
})();
/* === end easter-egg JS === */