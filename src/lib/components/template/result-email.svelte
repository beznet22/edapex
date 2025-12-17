<script lang="ts">
  // Interface for individual student data
  interface StudentReport {
    studentName: string;
    reportUrl: string;
    avatar?: string; // Optional avatar URL
  }

  // Props for dynamic content
 interface ReportData {
    schoolName?: string;
    guardianName?: string;
    principalName?: string;
    contactEmail?: string;
    contactPhone?: string;
    students: StudentReport[];
  }

 let {
    data = {
      schoolName: "Lighthouse Leading Academy",
      guardianName: "Mrs. Johnson",
      principalName: "Dr. A. Smith",
      contactEmail: "support@sms.com",
      contactPhone: "1234567890",
      students: [
        {
          studentName: "Alex Johnson",
          reportUrl: "#",
          avatar: "https://images.unsplash.com/photo-157954692962-711aa81148cf?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80",
        },
        {
          studentName: "Emma Johnson",
          reportUrl: "#",
          avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b2930?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80",
        },
      ],
    },
  }: { data?: ReportData } = $props();
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
    <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
    <title>Result Notification</title>

    <style type="text/css">
      /* Client-Specific Resets */
      body {
        margin: 0;
        padding: 0;
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
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
        margin: 13px 0;
      }

      /* Theme Colors (Converted from OKLCH for Email Support)
         Background: #FDFC (oklch 98%)
         Foreground: #524B45 (oklch 34% warm grey)
         Primary: #D65D3B (oklch 62% terracotta/orange)
         Secondary: #EBEB (oklch 92% light grey)
      */

      /* Responsive Styles */
      @media only screen and (max-width: 600px) {
        .mobile-wrapper {
          width: 100% !important;
          max-width: 100% !important;
        }
        .mobile-padding {
          padding-left: 20px !important;
          padding-right: 20px !important;
        }
        .mobile-block {
          display: block !important;
          width: 100% !important;
        }
        .mobile-center {
          text-align: center !important;
        }
        .img-fluid {
          width: 10% !important;
          height: auto !important;
        }
        .hide-mobile {
          display: none !important;
        }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: #FDFDFC;">
    <!-- Preheader Text (Hidden) -->
    <div style="display: none; max-height: 0px; overflow: hidden;">
      The Termly Summary of Progress Reports for your children are now available. &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
    </div>

    <!-- Main Container -->
    <center style="width: 100%; background-color: #FDFDFC;">
      <!--[if mso]>
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" align="center">
      <tr>
      <td width="600">
      <![endif]-->

      <table
        class="mobile-wrapper"
        role="presentation"
        width="10%"
        style="max-width: 600px; margin: 0 auto; background-color: #ffffff;"
        cellspacing="0"
        cellpadding="0"
        border="0"
        align="center"
      >
        <tbody>
          <!-- Header / Logo -->
          <tr>
            <td style="padding: 30px 40px; text-align: center; border-bottom: 3px solid #FDFDFC;">
              <a href="https://example.com" style="text-decoration: none;">
                <!-- Adapted for School Name prop -->
                <span
                  style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 20px; font-weight: bold; color: #D65D3B; letter-spacing: 0.5px; text-transform: uppercase;"
                >
                  {data.schoolName?.replace("Leading Academy", "")}
                  <span style="color: #524B45;">Leading Academy</span>
                </span>
              </a>
            </td>
          </tr>

          <!-- Hero Image -->
          <tr>
            <td style="padding: 0;">
              <a href="https://example.com">
                <!-- Kept academic/happy image -->
                <img
                  src="https://images.unsplash.com/photo-1503676260728-1c00da094a0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80"
                  alt="Student success"
                  width="600"
                  class="img-fluid"
                  style="display: block; width: 100%; max-width: 600px; height: auto; color: #524B45;"
                />
              </a>
            </td>
          </tr>

          <!-- Main Content Area -->
          <tr>
            <td class="mobile-padding" style="padding: 40px 40px 20px 40px;">
              <h1
                style="margin: 0 0 20px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 24px; line-height: 32px; color: #D65D3B; font-weight: bold;"
              >
                TERMLY SUMMARY OF PROGRESS REPORT
              </h1>

              <p
                style="margin: 0 0 16px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: #524B45;"
              >
                <strong>Dear {data.guardianName},</strong>
              </p>

              <p
                style="margin: 0 24px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: #524B45;"
              >
                We are pleased to inform you that the <strong>First Term Examination</strong> results for your
                children have been released and are now available for review.
              </p>
              <p
                style="margin: 0 20px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: #524B45;"
              >
                This report provides a comprehensive summary of academic performance, attendance, and
                behavioral development for the term.
              </p>

              <!-- Grid of Student Cards -->
              <p
                style="margin: 0 0 20px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: #524B45; font-weight: bold;"
              >
                Reports for your children:
              </p>
              
              <table role="presentation" cellspacing="10" cellpadding="0" border="0" style="width: 100%; margin: 0 30px 0;">
                <tbody>
                  {#each Array(Math.ceil(data.students.length / 2)) as _, rowIndex (rowIndex)}
                    <tr>
                      {#each data.students.slice(rowIndex * 2, rowIndex * 2 + 2) as student, colIndex (student.studentName || colIndex)}
                        <td style="background-color: #F7F7F7; border-radius: 8px; padding: 15px; text-align: center; width: 48%; vertical-align: top;" width="48%">
                          {#if student.avatar}
                          <img 
                            src={student.avatar} 
                            alt={student.studentName}
                            width="60"
                            height="60"
                            style="display: block; width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin: 0 auto 10px auto;"
                          />
                          {/if}
                          <p style="margin: 0 0 10px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; font-weight: bold; color: #524B45; text-align: center;">
                            {student.studentName}
                          </p>
                          <a 
                            href={student.reportUrl} 
                            style="background-color: #D65D3B; border: 1px solid #D65D3B; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; font-weight: bold; line-height: 1.5; text-decoration: none; padding: 8px 16px; color: #ffffff; display: inline-block; border-radius: 4px;"
                          >
                            View Report &rarr;
                          </a>
                        </td>
                      {/each}
                      
                      <!-- Add empty cell if there's an odd number of students in the last row -->
                      {#if (rowIndex * 2 + 1) === data.students.length - 1 && data.students.length % 2 !== 0}
                        <td style="background-color: #F7F7F7; border-radius: 8px; padding: 15px; text-align: center; width: 48%; vertical-align: top;" width="48;">
                          &nbsp;
                        </td>
                      {/if}
                    </tr>
                  {/each}
                </tbody>
              </table>

              <!-- Sign off -->
              <p
                style="margin: 30px 0 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: #524B45;"
              >
                Warm regards,<br />
                <strong>{data.principalName}</strong><br />
                <span style="font-size: 14px; color: #888888;">Principal, {data.schoolName}</span>
              </p>
            </td>
          </tr>

          <!-- Secondary Feature Section (Support) -->
          <tr>
            <td class="mobile-padding" style="padding: 20px 40px 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tbody>
                  <tr>
                    <td style="background-color: #F7F7F7; border-radius: 8px; padding: 30px;">
                      <table role="presentation" width="10%" cellspacing="0" cellpadding="0" border="0">
                        <tbody>
                          <tr>
                            <!-- Icon/Small Image -->
                            <td
                              width="50"
                              valign="top"
                              style="padding-right: 15px;"
                              class="mobile-block mobile-center"
                            >
                              <img
                                src="https://cdn-icons-png.flaticon.com/512/1067/1067566.png"
                                alt="Support Icon"
                                width="40"
                                height="40"
                                style="display: block; width: 40px; max-width: 40px;"
                              />
                            </td>
                            <!-- Text -->
                            <td valign="top" class="mobile-block mobile-center" style="padding-top: 5px;">
                              <h3
                                style="margin: 0 0 5px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; color: #D65D3B; font-weight: bold;"
                              >
                                Have questions about the result?
                              </h3>
                              <p
                                style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 22px; color: #524B45;"
                              >
                                Contact us at <a
                                  href={"mailto:" + data.contactEmail}
                                  style="color: #D65D3B; text-decoration: none;">{data.contactEmail}</a
                                >
                                or call <strong>{data.contactPhone}</strong>.
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
              style="background-color: #FDFDFC; border-top: 1px solid #EBEBEB; padding: 40px 20px; text-align: center;"
            >
              <p
                style="margin: 0 10px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #9999; line-height: 18px;"
              >
                <strong>{data.schoolName}</strong><br />
                Education for the Future
              </p>
              <p
                style="margin: 0 0 20px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #9999; line-height: 18px;"
              >
                You are receiving this email as a guardian of a registered student.<br />
                <a href="https://example.com" style="color: #99999; text-decoration: underline;">View in browser</a>
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      <!--[if mso]>
      </td>
      </tr>
      </table>
      <![endif]-->
    </center>
  </body>
</html>
