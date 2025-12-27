<script lang="ts">
  // Props for dynamic content
  interface Props {
    schoolName: string;
    receiverName: string; // Parent name or guardian
    fullName: string; // Student full name
    term: string;
    principal: string;
    contact: string;
    support: string;
    logo?: string;
  }

  let {
    schoolName = "Lighthouse Leading Academy",
    receiverName = "Parent/Guardian",
    fullName = "Student Name",
    term = "Current Term",
    principal = "School Principal",
    contact = "Contact Phone",
    support = "Support Email",
    logo,
  }: Props = $props();

  // Color Constants (from layout.css)
  const colors = {
    primary: "#D65D3B",
    background: "#FDFDFC",
    foreground: "#524B45",
    cardBg: "#FFFFFF",
    muted: "#F7F7F7",
    border: "#EBEBEB",
    textLight: "#888888",
  };
</script>

<!-- Svelte head content for email compatibility -->
<svelte:head>
  <!--[if gte mso 9]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <![endif]-->
</svelte:head>

<!DOCTYPE html>
<html
  lang="en"
  {...{
    xmlns: "http://www.w3.org/1999/xhtml",
    "xmlns:v": "urn:schemas-microsoft-com:vml",
    "xmlns:o": "urn:schemas-microsoft-com:office:office",
  }}
>
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta http-equiv="content-type" content="text/html; charset=utf-8" />
    <meta http-equiv="x-ua-compatible" content="ie=edge" />
    <meta
      name="format-detection"
      content="telephone=no, date=no, address=no, email=no"
    />
    <title>Result notification</title>

    <style type="text/css">
      /* Client-Specific Resets */
      body {
        margin: 0;
        padding: 0;
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
        font-family: "Geist", "Helvetica Neue", Helvetica, Arial, sans-serif;
      }
      table,
      td {
        border-collapse: collapse;
        mso-table-lspace: 0pt;
        mso-table-rspace: 0pt;
      }
      img {
        border: 0;
        height: auto;
        line-height: 100%;
        outline: none;
        text-decoration: none;
        -ms-interpolation-mode: bicubic;
      }
      p {
        display: block;
        margin: 16px 0;
      }

      /* Responsive Styles */
      @media only screen and (max-width: 620px) {
        .mobile-wrapper {
          width: 95% !important;
          margin: 0 auto !important;
        }
        .mobile-padding {
          padding-left: 15px !important;
          padding-right: 15px !important;
        }
        .hero-title {
          font-size: 24px !important;
        }
        .hero-subtitle {
          font-size: 13px !important;
        }
        .support-card {
          padding: 20px !important;
        }
      }

      @media only screen and (max-width: 480px) {
        .mobile-wrapper {
          width: 100% !important;
          border-radius: 0 !important;
        }
        .hero-title {
          font-size: 22px !important;
        }
        .main-text {
          font-size: 15px !important;
          line-height: 24px !important;
        }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: {colors.background};">
    <!-- Preheader Text (Hidden) -->
    <div style="display: none; max-height: 0px; overflow: hidden;">
      The termly summary of progress report for {fullName} is now available. &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
    </div>

    <!-- Main Container -->
    <center
      style="width: 100%; background-color: {colors.background}; padding: 40px 0;"
    >
      <table
        class="mobile-wrapper"
        role="presentation"
        width="600"
        style="width: 600px; max-width: 600px; margin: 0 auto; background-color: {colors.cardBg}; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);"
        cellspacing="0"
        cellpadding="0"
        border="0"
        align="center"
      >
        <tbody>
          <!-- Decorative Header -->
          <tr>
            <td
              style="padding: 0; position: relative; background: linear-gradient(135deg, {colors.primary} 0%, {colors.primary}dd 100%);"
            >
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
              >
                <tbody>
                  <tr>
                    <td
                      style="padding: 40px 40px 30px 40px; text-align: center;"
                    >
                      <!-- School Logo -->
                      <div style="margin-bottom: 20px;">
                        <img
                          src="cid:schoolLogo"
                          alt={schoolName}
                          width="100"
                          style="background: white; padding: 10px; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"
                        />
                      </div>
                      <h2
                        style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 18px; color: #FFFFFF; font-weight: 500; letter-spacing: 0.5px;"
                      >
                        {schoolName}
                      </h2>
                    </td>
                  </tr>
                </tbody>
              </table>

              <!-- Subtle Balloon Decorations (Using table cells for layout spacing) -->
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="position: absolute; top: 0; left: 0; pointer-events: none;"
              >
                <tbody>
                  <tr>
                    <td align="left" valign="top" style="padding: 10px;">
                      <img
                        src="https://cdn-icons-png.flaticon.com/512/3256/3256158.png"
                        width="30"
                        height="30"
                        alt=""
                        style="opacity: 0.2;"
                      />
                    </td>
                    <td align="right" valign="top" style="padding: 10px;">
                      <img
                        src="https://cdn-icons-png.flaticon.com/512/3256/3256158.png"
                        width="30"
                        height="30"
                        alt=""
                        style="opacity: 0.2;"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Hero Content -->
          <tr>
            <td
              class="mobile-padding"
              style="padding: 40px 40px 10px 40px; text-align: center;"
            >
              <p
                class="hero-subtitle"
                style="margin: 0; font-size: 14px; font-weight: 600; color: {colors.primary}; text-transform: uppercase; letter-spacing: 1px;"
              >
                Announcement
              </p>
              <h1
                class="hero-title"
                style="margin: 10px 0 20px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 28px; line-height: 1.2; color: {colors.foreground}; font-weight: 700;"
              >
                Termly progress report
              </h1>
              <div
                style="height: 2px; width: 60px; background-color: {colors.primary}; margin: 0 auto 30px auto;"
              ></div>
            </td>
          </tr>

          <!-- Main Message -->
          <tr>
            <td class="mobile-padding" style="padding: 0 40px 40px 40px;">
              <p
                class="main-text"
                style="margin: 0 0 20px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: {colors.foreground};"
              >
                Dear {receiverName},
              </p>

              <p
                class="main-text"
                style="margin: 0 0 20px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: {colors.foreground};"
              >
                We are pleased to inform you that the <strong>{term}</strong>
                examination results for <strong>{fullName}</strong> have been released.
              </p>

              <p
                class="main-text"
                style="margin: 0 0 30px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: {colors.foreground};"
              >
                The comprehensive report is attached to this email as a PDF
                document for your review. This report provides a summary of
                academic performance, attendance, and behavioral development for
                the term.
              </p>

              <!-- Static Confetti / Achievement Decoration -->
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="margin-bottom: 30px;"
              >
                <tbody>
                  <tr>
                    <td
                      align="center"
                      style="padding: 20px; background-color: #FFF5F2; border-radius: 8px; border: 1px dashed {colors.primary}44;"
                    >
                      <img
                        src="https://cdn-icons-png.flaticon.com/512/5812/5812975.png"
                        width="40"
                        height="40"
                        alt="Success"
                        style="margin-bottom: 10px;"
                      />
                      <p
                        style="margin: 0; font-size: 14px; font-weight: 500; color: {colors.primary};"
                      >
                        Great progress achieved this term!
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>

              <!-- Sign off -->
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="margin-top: 40px;"
              >
                <tbody>
                  <tr>
                    <td>
                      <p
                        style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: {colors.foreground};"
                      >
                        Warm regards,
                      </p>
                      <p
                        style="margin: 5px 0 0 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 18px; font-weight: 700; color: {colors.foreground};"
                      >
                        {principal}
                      </p>
                      <p
                        style="margin: 0; font-size: 14px; color: {colors.textLight};"
                      >
                        Principal, {schoolName}
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Support Section -->
          <tr>
            <td class="mobile-padding" style="padding: 0 40px 40px 40px;">
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="background-color: {colors.muted}; border-radius: 12px;"
              >
                <tbody>
                  <tr>
                    <td class="support-card" style="padding: 30px;">
                      <table
                        role="presentation"
                        width="100%"
                        cellspacing="0"
                        cellpadding="0"
                        border="0"
                      >
                        <tbody>
                          <tr>
                            <td
                              width="48"
                              valign="top"
                              style="padding-right: 15px;"
                            >
                              <img
                                src="https://cdn-icons-png.flaticon.com/512/1067/1067566.png"
                                alt="Support"
                                width="40"
                                height="40"
                                style="display: block;"
                              />
                            </td>
                            <td valign="top">
                              <h3
                                style="margin: 0 0 8px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; color: {colors.foreground}; font-weight: 700;"
                              >
                                Questions about the result?
                              </h3>
                              <p
                                class="main-text"
                                style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 22px; color: {colors.foreground};"
                              >
                                Contact us at <a
                                  href={"mailto:" + support}
                                  style="color: {colors.primary}; text-decoration: none; font-weight: 500;"
                                  >{support}</a
                                >
                                or call
                                <strong style="color: {colors.foreground};"
                                  >{contact}</strong
                                >.
                              </p>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td
              style="padding: 40px 20px; text-align: center; background-color: {colors.muted};"
            >
              <p
                style="margin: 0 0 8px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; color: {colors.foreground}; letter-spacing: 0.5px; text-transform: uppercase;"
              >
                {schoolName}
              </p>
              <p
                style="margin: 0 0 16px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: {colors.textLight}; line-height: 1.5;"
              >
                Education for the future
              </p>
              <p
                style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: {colors.textLight};"
              >
                You are receiving this email as a guardian of a registered
                student.<br />
                Please do not reply directly to this automated notification.
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Gift Decoration (Outside the main card for a floating effect) -->
      <table
        class="mobile-wrapper"
        role="presentation"
        width="600"
        style="width: 600px; max-width: 600px; margin-top: 20px;"
        cellspacing="0"
        cellpadding="0"
        border="0"
        align="center"
      >
        <tbody>
          <tr>
            <td align="center">
              <img
                src="https://cdn-icons-png.flaticon.com/512/714/714035.png"
                width="24"
                height="24"
                alt=""
                style="opacity: 0.3;"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </center>
  </body>
</html>
