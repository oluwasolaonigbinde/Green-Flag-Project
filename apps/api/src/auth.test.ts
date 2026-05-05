import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  exportJWK,
  generateKeyPair,
  SignJWT
} from "jose";
import {
  auditEventFixture,
  globalAdminRoleAssignmentFixture,
  internalUserSummaryFixture
} from "@green-flag/contracts";
import {
  appendAuditEvent,
  createCognitoJwtVerifier,
  createSessionResolver
} from "./auth.js";

describe("auth foundation", () => {
  let server: ReturnType<typeof createServer> | undefined;
  let baseUrl = "";
  let signingKey = undefined as Awaited<ReturnType<typeof generateKeyPair>>["privateKey"] | undefined;

  beforeAll(async () => {
    const keyPair = await generateKeyPair("RS256");
    signingKey = keyPair.privateKey;
    const { publicKey } = keyPair;
    const jwk = await exportJWK(publicKey);
    jwk.kid = "demo-key";
    jwk.use = "sig";
    jwk.alg = "RS256";

    server = createServer((request, response) => {
      if (request.url === "/.well-known/jwks.json") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ keys: [jwk] }));
        return;
      }

      response.statusCode = 404;
      response.end();
    });

    await new Promise<void>((resolve) => {
      server?.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server?.address();
    if (typeof address === "object" && address) {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }
  });

  afterAll(async () => {
    if (!server) {
      return;
    }

    const activeServer = server;
    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  it("verifies a JWT through a JWKS endpoint", async () => {
    if (!signingKey) {
      throw new Error("Signing key was not initialized");
    }

    const verifier = createCognitoJwtVerifier({
      jwksUrl: `${baseUrl}/.well-known/jwks.json`,
      issuer: "https://cognito.example.invalid",
      audience: "green-flag-api"
    });

    const token = await new SignJWT({
      sub: "cognito-subject-global-admin",
      email: "global.admin@example.invalid",
      amr: ["pwd", "mfa"]
    })
      .setProtectedHeader({ alg: "RS256", kid: "demo-key" })
      .setIssuer("https://cognito.example.invalid")
      .setAudience("green-flag-api")
      .setSubject("cognito-subject-global-admin")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(signingKey);

    await expect(verifier(`Bearer ${token}`)).resolves.toMatchObject({
      sub: "cognito-subject-global-admin",
      email: "global.admin@example.invalid"
    });
  });

  it("resolves a session profile from identity and RBAC records", async () => {
    const sessionResolver = createSessionResolver({
      verifyBearerToken: async () => ({
        sub: internalUserSummaryFixture.cognitoSubject,
        email: internalUserSummaryFixture.email,
        amr: ["pwd", "mfa"]
      }),
      identityRepository: {
        async findInternalUserByCognitoSubject(subject) {
          if (subject !== internalUserSummaryFixture.cognitoSubject) {
            return null;
          }

          return internalUserSummaryFixture;
        },
        async listRoleAssignmentsByUserId(userId) {
          if (userId !== internalUserSummaryFixture.id) {
            return [];
          }

          return [globalAdminRoleAssignmentFixture];
        }
      }
    });

    const session = await sessionResolver({
      headers: {
        authorization: "Bearer demo"
      }
    } as never);

    expect(session.actor.role).toBe("SUPER_ADMIN");
    expect(session.mfaSatisfied).toBe(true);
    expect(session.roleAssignments).toHaveLength(1);
  });

  it("rejects admin sessions that have not satisfied MFA", async () => {
    const sessionResolver = createSessionResolver({
      verifyBearerToken: async () => ({
        sub: internalUserSummaryFixture.cognitoSubject,
        email: internalUserSummaryFixture.email,
        amr: ["pwd"]
      }),
      identityRepository: {
        async findInternalUserByCognitoSubject(subject) {
          if (subject !== internalUserSummaryFixture.cognitoSubject) {
            return null;
          }

          return internalUserSummaryFixture;
        },
        async listRoleAssignmentsByUserId(userId) {
          if (userId !== internalUserSummaryFixture.id) {
            return [];
          }

          return [globalAdminRoleAssignmentFixture];
        }
      }
    });

    await expect(
      sessionResolver({
        headers: {
          authorization: "Bearer demo"
        }
      } as never)
    ).rejects.toMatchObject({
      code: "forbidden",
      statusCode: 403
    });
  });

  it("appends immutable audit events through the audit helper", async () => {
    const events: Array<typeof auditEventFixture> = [];
    const appended = await appendAuditEvent(
      {
        async append(event) {
          events.push(event);
        }
      },
      auditEventFixture
    );

    expect(appended).toEqual(auditEventFixture);
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe("ASSIGN_ROLE");
  });
});
