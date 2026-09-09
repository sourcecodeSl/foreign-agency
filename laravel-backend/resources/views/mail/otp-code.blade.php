<div style="margin:0;padding:24px;background:#f3f4f6;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">

    <div style="padding:20px 28px;background:#1d41f5;color:#ffffff">
      <span style="font-size:16px;font-weight:700">{{ config('app.name') }}</span>
      <span style="font-size:12px;opacity:.85;display:block;margin-top:2px">Agency &amp; Candidate Management</span>
    </div>

    <div style="padding:28px">
      <h1 style="margin:0 0 12px;font-size:18px;color:#111827">Your verification code</h1>

      <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.6">
        Enter this code to finish signing in. It expires in {{ $minutes }} minutes.
      </p>

      <div style="text-align:center;margin:0 0 20px">
        <span style="display:inline-block;padding:14px 28px;background:#eef4ff;border:1px solid #bcd3ff;
                     border-radius:10px;font-family:Consolas,Menlo,monospace;font-size:30px;font-weight:700;
                     letter-spacing:10px;color:#162fe1">{{ $code }}</span>
      </div>

      <p style="margin:0;color:#6b7280;font-size:13px">Never share this code with anyone.</p>
    </div>

    <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px">
      If you did not request this, you can safely ignore this email.
    </div>

  </div>
</div>
