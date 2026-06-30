const RESEND_API_URL = 'https://api.resend.com/emails';

function isEmailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function sendVerificationEmail({ to, displayName, verifyUrl }) {
  if (!isEmailEnabled()) {
    console.warn('[이메일 인증] RESEND_API_KEY 또는 EMAIL_FROM이 없어 인증 메일을 보내지 않았습니다.');
    return { skipped: true };
  }

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to,
      subject: 'MusicPlz 이메일 인증을 완료해주세요',
      html: buildVerificationHtml({ displayName, verifyUrl }),
      text: `MusicPlz 이메일 인증을 완료하려면 아래 링크를 열어주세요.\n\n${verifyUrl}\n\n이 링크는 30분 동안만 유효합니다.`,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resend 이메일 발송 실패 (status ${res.status}): ${text}`);
  }

  return res.json();
}

function buildVerificationHtml({ displayName, verifyUrl }) {
  const safeName = escapeHtml(displayName || 'MusicPlz 사용자');
  const safeUrl = escapeHtml(verifyUrl);

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#111;max-width:560px;margin:0 auto;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:24px;">MusicPlz 이메일 인증</h1>
      <p style="margin:0 0 18px;">${safeName}님, 가입을 완료하려면 아래 버튼을 눌러 이메일 인증을 완료해주세요.</p>
      <p style="margin:28px 0;">
        <a href="${safeUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:999px;">이메일 인증하기</a>
      </p>
      <p style="font-size:13px;color:#666;margin:0 0 8px;">버튼이 열리지 않으면 아래 링크를 브라우저에 붙여넣어 주세요.</p>
      <p style="font-size:13px;color:#666;word-break:break-all;margin:0;">${safeUrl}</p>
      <p style="font-size:13px;color:#999;margin-top:24px;">이 링크는 30분 동안만 유효합니다.</p>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { isEmailEnabled, sendVerificationEmail };
