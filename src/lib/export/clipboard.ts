/**
 * 클립보드 복사.
 *
 * 주의: iOS 는 사용자 제스처 핸들러 안에서 호출해야 한다.
 * 복사할 텍스트를 미리 만들어두고 클릭 핸들러의 첫 문장에서 바로 넘길 것 —
 * await 를 한 번 거친 뒤에 부르면 제스처와의 연결이 끊겨 실패한다.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 아래 폴백으로
    }
  }

  // http://192.168.x.x 처럼 secure context 가 아닌 경우의 폴백
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
