import { describe, expect, it } from "vitest";
import {
  applicationDocumentsFixture,
  globalAdminSessionFixture,
  parkManagerSessionFixture,
  signedDocumentAccessFixture
} from "@green-flag/contracts";
import {
  assertNoApplicantMysteryLeak,
  projectMysteryMessageForSession,
  projectMysteryNotificationForSession,
  projectMysterySearchExportForSession,
  redactApplicantDocumentsForSession,
  redactSignedDocumentAccessForSession,
  safeMysteryStatusLabelForSession
} from "./redaction.js";

describe("central Mystery redaction policy", () => {
  it("redacts applicant/org document metadata while retaining admin visibility", () => {
    const applicantProjection = redactApplicantDocumentsForSession(
      applicationDocumentsFixture,
      parkManagerSessionFixture
    );
    expect(JSON.stringify(applicantProjection)).not.toContain("MYSTERY_RESTRICTED");
    expect(JSON.stringify(applicantProjection)).not.toContain("mystery-visit-notes.pdf");

    const adminProjection = redactApplicantDocumentsForSession(
      applicationDocumentsFixture,
      globalAdminSessionFixture
    );
    expect(adminProjection).toEqual(applicationDocumentsFixture);
  });

  it("redacts signed Mystery document metadata for applicant/org actors", () => {
    const redacted = redactSignedDocumentAccessForSession(
      {
        ...signedDocumentAccessFixture,
        visibility: "MYSTERY_RESTRICTED",
        filename: "mystery-visit-notes.pdf",
        contentType: "application/pdf"
      },
      parkManagerSessionFixture
    );
    expect(redacted).toMatchObject({
      filename: "redacted",
      contentType: "application/octet-stream",
      visibility: "MYSTERY_RESTRICTED"
    });
  });

  it("suppresses notification, message, search, export, and status surfaces for applicant/org actors", () => {
    const notification = projectMysteryNotificationForSession({
      notificationId: "45454545-4545-4454-8454-454545454545",
      isMystery: true,
      label: "Mystery assignment release",
      session: parkManagerSessionFixture
    });
    expect(notification).toMatchObject({
      visible: false,
      suppressed: true,
      redaction: {
        action: "suppress"
      }
    });
    expect(JSON.stringify(notification)).not.toContain("Mystery assignment release");

    const message = projectMysteryMessageForSession({
      threadId: "46464646-4646-4464-8464-464646464646",
      isMystery: true,
      subject: "Judge visit timing",
      session: parkManagerSessionFixture
    });
    expect(message).toMatchObject({
      visible: false,
      hiddenMessageCount: 0
    });
    expect(JSON.stringify(message)).not.toContain("Judge visit timing");

    const search = projectMysterySearchExportForSession({
      surface: "applicant_search",
      isMystery: true,
      count: 3,
      session: parkManagerSessionFixture
    });
    expect(search).toMatchObject({
      visibleCount: 0,
      countSuppressed: true
    });

    const exportProjection = projectMysterySearchExportForSession({
      surface: "applicant_export",
      isMystery: true,
      count: 3,
      session: parkManagerSessionFixture
    });
    expect(exportProjection.visibleCount).toBe(0);

    expect(safeMysteryStatusLabelForSession({
      isMystery: true,
      statusLabel: "MYSTERY_SHOP_ALLOCATED",
      session: parkManagerSessionFixture
    })).toBe("APPLICATION_UNDER_REVIEW");

    assertNoApplicantMysteryLeak(notification, parkManagerSessionFixture);
    assertNoApplicantMysteryLeak(message, parkManagerSessionFixture);
    assertNoApplicantMysteryLeak(search, parkManagerSessionFixture);
  });

  it("keeps admin/super-admin visibility intact", () => {
    const notification = projectMysteryNotificationForSession({
      notificationId: "45454545-4545-4454-8454-454545454545",
      isMystery: true,
      label: "Mystery assignment release",
      session: globalAdminSessionFixture
    });
    expect(notification).toMatchObject({
      visible: true,
      suppressed: false,
      label: "Mystery assignment release"
    });

    expect(safeMysteryStatusLabelForSession({
      isMystery: true,
      statusLabel: "MYSTERY_SHOP_ALLOCATED",
      session: globalAdminSessionFixture
    })).toBe("MYSTERY_SHOP_ALLOCATED");
  });
});
