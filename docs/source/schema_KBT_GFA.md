# Database Schema: KBT_GFA (P2453)
> Logical file: P740_Code_Resource | Backup: 2026-05-04 | Size: 51MB
> Platform: **Umbraco CMS** (with Umbraco Forms)

## Application Tables

### __EFMigrationsHistory
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | MigrationId | nvarchar(150) | NO | — | — |
| 2 | ProductVersion | nvarchar(32) | NO | — | — |

## Umbraco CMS Core Tables

### cmsContentNu
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | nodeId | int | NO | — | — |
| 2 | published | bit | NO | — | — |
| 3 | data | nvarchar(MAX) | YES | — | — |
| 4 | rv | bigint | NO | — | — |
| 5 | dataRaw | varbinary(MAX) | YES | — | — |

### cmsContentType
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | pk | int | NO | — | IDENTITY |
| 2 | nodeId | int | NO | — | — |
| 3 | alias | nvarchar(255) | YES | — | — |
| 4 | icon | nvarchar(255) | YES | — | — |
| 5 | thumbnail | nvarchar(255) | NO | 'folder.png' | — |
| 6 | description | nvarchar(1500) | YES | — | — |
| 7 | isContainer | bit | NO | '0' | — |
| 8 | isElement | bit | NO | '0' | — |
| 9 | allowAtRoot | bit | NO | '0' | — |
| 10 | variations | int | NO | '1' | — |

### cmsContentType2ContentType
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | parentContentTypeId | int | NO | — | — |
| 2 | childContentTypeId | int | NO | — | — |

### cmsContentTypeAllowedContentType
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | Id | int | NO | — | — |
| 2 | AllowedId | int | NO | — | — |
| 3 | SortOrder | int | NO | '0' | — |

### cmsDictionary
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | pk | int | NO | — | IDENTITY |
| 2 | id | uniqueidentifier | NO | — | — |
| 3 | parent | uniqueidentifier | YES | — | — |
| 4 | key | nvarchar(450) | NO | — | — |

### cmsDocumentType
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | contentTypeNodeId | int | NO | — | — |
| 2 | templateNodeId | int | NO | — | — |
| 3 | IsDefault | bit | NO | '0' | — |

### cmsLanguageText
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | pk | int | NO | — | IDENTITY |
| 2 | languageId | int | NO | — | — |
| 3 | UniqueId | uniqueidentifier | NO | — | — |
| 4 | value | nvarchar(1000) | NO | — | — |

### cmsMacro
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | id | int | NO | — | IDENTITY |
| 2 | uniqueId | uniqueidentifier | NO | — | — |
| 3 | macroUseInEditor | bit | NO | '0' | — |
| 4 | macroRefreshRate | int | NO | '0' | — |
| 5 | macroAlias | nvarchar(255) | NO | — | — |
| 6 | macroName | nvarchar(255) | YES | — | — |
| 7 | macroCacheByPage | bit | NO | '1' | — |
| 8 | macroCachePersonalized | bit | NO | '0' | — |
| 9 | macroDontRender | bit | NO | '0' | — |
| 10 | macroSource | nvarchar(255) | NO | — | — |
| 11 | macroType | int | NO | — | — |

### cmsMacroProperty
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | id | int | NO | — | IDENTITY |
| 2 | uniquePropertyId | uniqueidentifier | NO | — | — |
| 3 | editorAlias | nvarchar(255) | NO | — | — |
| 4 | macro | int | NO | — | — |
| 5 | macroPropertySortOrder | int | NO | '0' | — |
| 6 | macroPropertyAlias | nvarchar(50) | NO | — | — |
| 7 | macroPropertyName | nvarchar(255) | NO | — | — |

### cmsMember
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | nodeId | int | NO | — | — |
| 2 | Email | nvarchar(1000) | NO | '' | — |
| 3 | LoginName | nvarchar(1000) | NO | '' | — |
| 4 | Password | nvarchar(1000) | NO | '' | — |
| 5 | passwordConfig | nvarchar(500) | YES | — | — |
| 6 | securityStampToken | nvarchar(255) | YES | — | — |
| 7 | emailConfirmedDate | datetime | YES | — | — |
| 8 | failedPasswordAttempts | int | YES | — | — |
| 9 | isLockedOut | bit | YES | '0' | — |
| 10 | isApproved | bit | NO | '1' | — |
| 11 | lastLoginDate | datetime | YES | — | — |
| 12 | lastLockoutDate | datetime | YES | — | — |
| 13 | lastPasswordChangeDate | datetime | YES | — | — |

### cmsMember2MemberGroup
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | Member | int | NO | — | — |
| 2 | MemberGroup | int | NO | — | — |

### cmsMemberType
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | pk | int | NO | — | IDENTITY |
| 2 | NodeId | int | NO | — | — |
| 3 | propertytypeId | int | NO | — | — |
| 4 | memberCanEdit | bit | NO | '0' | — |
| 5 | viewOnProfile | bit | NO | '0' | — |
| 6 | isSensitive | bit | NO | '0' | — |

### cmsPropertyType
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | id | int | NO | — | IDENTITY |
| 2 | dataTypeId | int | NO | — | — |
| 3 | contentTypeId | int | NO | — | — |
| 4 | propertyTypeGroupId | int | YES | — | — |
| 5 | Alias | nvarchar(255) | NO | — | — |
| 6 | Name | nvarchar(255) | YES | — | — |
| 7 | sortOrder | int | NO | '0' | — |
| 8 | mandatory | bit | NO | '0' | — |
| 9 | mandatoryMessage | nvarchar(500) | YES | — | — |
| 10 | validationRegExp | nvarchar(255) | YES | — | — |
| 11 | validationRegExpMessage | nvarchar(500) | YES | — | — |
| 12 | Description | nvarchar(2000) | YES | — | — |
| 13 | labelOnTop | bit | NO | '0' | — |
| 14 | variations | int | NO | '1' | — |
| 15 | UniqueID | uniqueidentifier | NO | newid() | — |

### cmsPropertyTypeGroup
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | id | int | NO | — | IDENTITY |
| 2 | uniqueID | uniqueidentifier | NO | newid() | — |
| 3 | contenttypeNodeId | int | NO | — | — |
| 4 | type | int | NO | '0' | — |
| 5 | text | nvarchar(255) | NO | — | — |
| 6 | alias | nvarchar(255) | NO | — | — |
| 7 | sortorder | int | NO | — | — |

### cmsTagRelationship
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | nodeId | int | NO | — | — |
| 2 | tagId | int | NO | — | — |
| 3 | propertyTypeId | int | NO | — | — |

### cmsTags
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | id | int | NO | — | IDENTITY |
| 2 | group | nvarchar(100) | NO | — | — |
| 3 | languageId | int | YES | — | — |
| 4 | tag | nvarchar(200) | NO | — | — |

### cmsTemplate
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | pk | int | NO | — | IDENTITY |
| 2 | nodeId | int | NO | — | — |
| 3 | alias | nvarchar(100) | YES | — | — |

## Umbraco Forms (UF*) Tables

### UFDataSource
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | Id | int | NO | — | IDENTITY |
| 2 | Key | uniqueidentifier | NO | — | — |
| 3 | Name | nvarchar(255) | NO | — | — |
| 4 | Definition | ntext | NO | — | — |
| 5 | Created | datetime | NO | — | — |
| 6 | Updated | datetime | NO | — | — |

### UFFolders
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ParentKey | uniqueidentifier | YES | — | — |
| 2 | Id | int | NO | — | IDENTITY |
| 3 | Key | uniqueidentifier | NO | — | — |
| 4 | Name | nvarchar(255) | NO | — | — |
| 5 | Definition | ntext | NO | — | — |
| 6 | Created | datetime | NO | — | — |
| 7 | Updated | datetime | NO | — | — |

### UFForms
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | FolderKey | uniqueidentifier | YES | — | — |
| 2 | Id | int | NO | — | IDENTITY |
| 3 | Key | uniqueidentifier | NO | — | — |
| 4 | Name | nvarchar(255) | NO | — | — |
| 5 | Definition | ntext | NO | — | — |
| 6 | Created | datetime | NO | — | — |
| 7 | Updated | datetime | NO | — | — |

### UFPrevalueSource
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | Id | int | NO | — | IDENTITY |
| 2 | Key | uniqueidentifier | NO | — | — |
| 3 | Name | nvarchar(255) | NO | — | — |
| 4 | Definition | ntext | NO | — | — |
| 5 | Created | datetime | NO | — | — |
| 6 | Updated | datetime | NO | — | — |

### UFRecordAudit
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | Id | int | NO | — | IDENTITY |
| 2 | Record | int | NO | — | — |
| 3 | UpdatedOn | datetime | NO | — | — |
| 4 | UpdatedBy | int | YES | — | — |

### UFRecordDataBit / UFRecordDataDateTime / UFRecordDataInteger / UFRecordDataLongString / UFRecordDataString
Each stores typed form field values: `Id` (IDENTITY), `Key` (uniqueidentifier), `Value` (typed)

### UFRecordFields
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | Key | uniqueidentifier | NO | — | — |
| 2 | FieldId | uniqueidentifier | NO | — | — |
| 3 | Record | int | NO | — | — |
| 4 | Alias | nvarchar(255) | NO | — | — |
| 5 | DataType | nvarchar(255) | NO | — | — |

### UFRecords
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | Id | int | NO | — | IDENTITY |
| 2 | Form | uniqueidentifier | NO | — | — |
| 3 | Created | datetime | NO | — | — |
| 4 | Updated | datetime | NO | — | — |
| 5 | CurrentPage | uniqueidentifier | YES | — | — |
| 6 | UmbracoPageId | int | YES | — | — |
| 7 | IP | nvarchar(255) | YES | — | — |
| 8 | MemberKey | nvarchar(255) | YES | — | — |
| 9 | UniqueId | uniqueidentifier | NO | — | — |
| 10 | State | nvarchar(50) | YES | — | — |
| 11 | RecordData | ntext | NO | — | — |
| 12 | Culture | nvarchar(84) | YES | — | — |

### UFRecordWorkflowAudit
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | Id | int | NO | — | IDENTITY |
| 2 | RecordUniqueId | uniqueidentifier | NO | — | — |
| 3 | WorkflowKey | uniqueidentifier | NO | — | — |
| 4 | WorkflowName | nvarchar(255) | NO | — | — |
| 5 | WorkflowTypeId | uniqueidentifier | NO | — | — |
| 6 | WorkflowTypeName | nvarchar(255) | NO | — | — |
| 7 | ExecutedOn | datetime | NO | — | — |
| 8 | ExecutionStage | int | YES | — | — |
| 9 | ExecutionStatus | int | NO | — | — |

### UFUserFormSecurity / UFUserGroupFormSecurity / UFUserSecurity / UFUserGroupSecurity
Security permission tables linking users/groups to forms with HasAccess, AllowInEditor, SecurityType flags.

### UFWorkflows
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | FormId | uniqueidentifier | NO | — | — |
| 2 | Id | int | NO | — | IDENTITY |
| 3 | Key | uniqueidentifier | NO | — | — |
| 4 | Name | nvarchar(255) | NO | — | — |
| 5 | Definition | ntext | NO | — | — |
| 6 | Created | datetime | NO | — | — |
| 7 | Updated | datetime | NO | — | — |

## Umbraco Core Infrastructure Tables

### umbracoAccess / umbracoAccessRule
Access control for protected content nodes.

### umbracoAudit
Admin audit log: performingUserId, performingIp, eventDateUtc, affectedUserId, eventType, eventDetails.

### umbracoCacheInstruction
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | id | int | NO | — | IDENTITY |
| 2 | utcStamp | datetime | NO | — | — |
| 3 | jsonInstruction | nvarchar(MAX) | YES | — | — |
| 4 | originated | nvarchar(500) | NO | — | — |
| 5 | instructionCount | int | NO | '1' | — |

### umbracoConsent
GDPR consent tracking: source, context, action, state, comment.

### umbracoContent / umbracoContentSchedule / umbracoContentVersion
Core content versioning chain.

### umbracoContentVersionCleanupPolicy
Per content-type cleanup policy: preventCleanup, keepAllVersionsNewerThanDays, keepLatestVersionPerDayForDays.

### umbracoContentVersionCultureVariation
Culture-specific version state: versionId, languageId, name, date.

### umbracoDataType
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | nodeId | int | NO | — | — |
| 2 | propertyEditorAlias | nvarchar(255) | NO | — | — |
| 3 | dbType | nvarchar(50) | NO | — | — |
| 4 | config | nvarchar(MAX) | YES | — | — |

### umbracoDocument / umbracoDocumentCultureVariation / umbracoDocumentVersion
Published document tracking with culture variants.

### umbracoDomain
Multi-site domain configuration: domainName, domainDefaultLanguage, domainRootStructureID.

### umbracoExternalLogin / umbracoExternalLoginToken
OAuth/external login provider linkage.

### umbracoLanguage
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | id | int | NO | — | IDENTITY |
| 2 | languageISOCode | nvarchar(14) | YES | — | — |
| 3 | languageCultureName | nvarchar(100) | YES | — | — |
| 4 | isDefaultVariantLang | bit | NO | '0' | — |
| 5 | mandatory | bit | NO | '0' | — |
| 6 | fallbackLanguageId | int | YES | — | — |

### umbracoLog
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | id | int | NO | — | IDENTITY |
| 2 | userId | int | YES | — | — |
| 3 | NodeId | int | NO | — | — |
| 4 | entityType | nvarchar(50) | YES | — | — |
| 5 | Datestamp | datetime | NO | getdate() | — |
| 6 | logHeader | nvarchar(50) | NO | — | — |
| 7 | logComment | nvarchar(4000) | YES | — | — |
| 8 | parameters | nvarchar(500) | YES | — | — |

### umbracoNode
Core content node hierarchy: id, uniqueId, parentId, level, path, sortOrder, trashed, nodeUser, text, nodeObjectType, createDate.

### umbracoOpenIddictApplications / umbracoOpenIddictAuthorizations / umbracoOpenIddictScopes / umbracoOpenIddictTokens
OpenID Connect / OAuth2 infrastructure tables.

### umbracoPropertyData
Stores all property values: versionId, propertyTypeId, languageId, segment, intValue, decimalValue, dateValue, varcharValue, textValue.

### umbracoRedirectUrl
SEO redirect tracking: contentKey, url, culture, urlHash.

### umbracoRelation / umbracoRelationType
Generic content relationship system.

### umbracoServer
Registered server nodes (for multi-server/load-balanced setups).

### umbracoTwoFactorLogin
2FA secrets per user/member: userOrMemberKey, providerName, secret.

### umbracoUser
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | id | int | NO | — | IDENTITY |
| 2 | userDisabled | bit | NO | '0' | — |
| 3 | userNoConsole | bit | NO | '0' | — |
| 4 | userName | nvarchar(255) | NO | — | — |
| 5 | userLogin | nvarchar(125) | NO | — | — |
| 6 | userPassword | nvarchar(500) | NO | — | — |
| 7 | passwordConfig | nvarchar(500) | YES | — | — |
| 8 | userEmail | nvarchar(255) | NO | — | — |
| 9 | userLanguage | nvarchar(10) | YES | — | — |
| 10 | securityStampToken | nvarchar(255) | YES | — | — |
| 11 | failedLoginAttempts | int | YES | — | — |
| 12 | lastLockoutDate | datetime | YES | — | — |
| 13 | lastPasswordChangeDate | datetime | YES | — | — |
| 14 | lastLoginDate | datetime | YES | — | — |
| 15 | emailConfirmedDate | datetime | YES | — | — |
| 16 | invitedDate | datetime | YES | — | — |
| 17 | createDate | datetime | NO | getdate() | — |
| 18 | updateDate | datetime | NO | getdate() | — |
| 19 | avatar | nvarchar(500) | YES | — | — |
| 20 | tourData | nvarchar(MAX) | YES | — | — |

### umbracoUserGroup / umbracoUserGroup2App / umbracoUserGroup2Language / umbracoUserGroup2Node / umbracoUserGroup2NodePermission
User group and permission management tables.

### umbracoUserLogin
Active session tracking: sessionId, userId, loggedInUtc, lastValidatedUtc, loggedOutUtc, ipAddress.

### umbracoUserStartNode
Content/media tree start nodes per user.

### umbracoWebhook / umbracoWebhook2ContentTypeKeys / umbracoWebhook2Events / umbracoWebhook2Headers / umbracoWebhookLog / umbracoWebhookRequest
Webhook configuration and delivery log.

### SkybrudRedirects
Third-party redirect plugin: Key, RootKey, Url, QueryString, DestinationType, DestinationId, DestinationKey, DestinationUrl, IsPermanent, ForwardQueryString.

