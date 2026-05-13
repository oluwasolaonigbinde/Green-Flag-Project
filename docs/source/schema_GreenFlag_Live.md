# Database Schema: GreenFlag_Live (P2435)
> Logical file: GreenFlagLiveNew | Backup: 2026-05-04 | Size: 1.7GB
> Platform: **Umbraco CMS** (older version) + **custom Green Flag Award application**

---

## Custom Application Tables (Green Flag Award System)

### AdditionalField
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | FieldName | varchar(128) | YES | — | — |

### AdditionalFieldData
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | ContactID | int | NO | — | — |
| 3 | Data | varchar(MAX) | YES | — | — |
| 4 | AdditionalFieldID | int | NO | — | — |

### Administrator
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | FirstName | varchar(128) | YES | — | — |
| 3 | Surname | varchar(128) | YES | — | — |
| 4 | Email | varchar(256) | YES | — | — |
| 5 | IsActive | bit | NO | 'True' | — |
| 6 | IsDeleted | bit | NO | 'False' | — |
| 7 | DateCreated | datetime | NO | getdate() | — |
| 8 | DateUpdated | datetime | NO | — | — |
| 9 | DateDeleted | datetime | YES | — | — |

### AdministratorCountry
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | CountryID | int | NO | — | — |
| 3 | AdministratorID | int | NO | — | — |

### ApiAuth
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | UserName | nvarchar(50) | NO | — | — |
| 3 | Password | nvarchar(50) | NO | — | — |
| 4 | RefreshToken | nvarchar(50) | YES | — | — |
| 5 | ExpirationDate | datetime | YES | — | — |
| 6 | CreateDate | datetime | YES | — | — |

### Authority
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | Name | nvarchar(800) | NO | — | — |
| 3 | IsActive | bit | NO | — | — |
| 4 | CountryID | int | YES | — | — |

### Award
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | PrimaryJudgeNotes | varchar(MAX) | YES | — | — |
| 3 | SecondaryJudgeNotes | varchar(MAX) | YES | — | — |
| 4 | JudgingWindowStart | datetime | YES | — | — |
| 5 | JudgingWindowEnd | datetime | YES | — | — |
| 6 | PrimaryJudgeID | int | YES | — | — |
| 7 | SecondaryJudgeID | int | YES | — | — |
| 8 | IsProvisionallyConfirmed | bit | YES | — | — |
| 9 | IsJudgingTeamConfirmed | bit | YES | — | — |
| 10 | DateSubmitted | datetime | NO | — | — |
| 11 | DateUpdated | datetime | NO | — | — |
| 12 | DateCreated | datetime | NO | — | — |
| 13 | IsTeamSubmitted | bit | YES | — | — |
| 14 | ParkAwardApplicationID | int | YES | — | — |
| 15 | AwardTypeID | int | YES | — | — |
| 16 | IsPrimaryJudgeConfirmed | bit | YES | — | — |
| 17 | IsSecondaryJudgeConfirmed | bit | YES | — | — |
| 18 | AllocationDatePrimaryJudge | datetime | YES | — | — |
| 19 | AllocationDateSecondaryJudge | datetime | YES | — | — |

### AwardType
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | — |
| 2 | Name | nvarchar(100) | NO | — | — |

### Contact
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | ContactType | int | NO | — | — |
| 3 | Name | varchar(MAX) | YES | — | — |
| 4 | AddressLine1 | varchar(MAX) | YES | — | — |
| 5 | AddressLine2 | varchar(MAX) | YES | — | — |
| 6 | AddressLine3 | varchar(MAX) | YES | — | — |
| 7 | Postcode | varchar(MAX) | YES | — | — |
| 8 | TelNo | varchar(64) | YES | — | — |
| 9 | Mobile | varchar(64) | YES | — | — |
| 10 | Email | varchar(256) | YES | — | — |
| 11 | IsActive | bit | NO | — | — |
| 12 | DateCreated | datetime | NO | — | — |
| 13 | DateUpdated | datetime | NO | — | — |
| 14 | DateDeleted | datetime | YES | — | — |
| 15 | JobTitle | nvarchar(500) | YES | — | — |
| 16 | Organisation | nvarchar(500) | YES | — | — |

### ContactForms
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | FullName | nvarchar(256) | YES | — | — |
| 3 | EnquiryType | nvarchar(64) | YES | — | — |
| 4 | Organisation | nvarchar(128) | YES | — | — |
| 5 | JobTitle | nvarchar(128) | YES | — | — |
| 6 | TelNo | nvarchar(32) | YES | — | — |
| 7 | Email | nvarchar(128) | YES | — | — |
| 8 | Message | nvarchar(4000) | YES | — | — |
| 9 | DateSubmitted | datetime | YES | — | — |

### ContactTypeAdditionalField
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | ContactType | int | NO | — | — |
| 3 | AdditionalFieldDataID | int | NO | — | — |

### Country
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | Name | nvarchar(200) | NO | — | — |
| 3 | IsActive | bit | NO | — | — |
| 4 | SeasonStartDate | datetime | YES | — | — |
| 5 | SeasonEndDate | datetime | YES | — | — |
| 6 | CurrentSeasonYear | int | YES | — | — |
| 7 | Latitude | decimal(18,6) | YES | — | — |
| 8 | Longitude | decimal(18,6) | YES | — | — |

### CountrySeason
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | SeasonStartDate | datetime | NO | — | — |
| 3 | SeasonEndDate | datetime | NO | — | — |
| 4 | SeasonYear | int | NO | — | — |
| 5 | CountryID | int | NO | — | — |
| 6 | DateCreated | datetime | NO | — | — |

### County
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | — |
| 2 | Name | nvarchar(200) | NO | — | — |
| 3 | IsActive | bit | NO | — | — |

### EmailLog
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | From | nvarchar(200) | NO | — | — |
| 3 | To | nvarchar(MAX) | NO | — | — |
| 4 | CC | nvarchar(MAX) | YES | — | — |
| 5 | BCC | nvarchar(MAX) | YES | — | — |
| 6 | Subject | nvarchar(500) | NO | — | — |
| 7 | Body | nvarchar(MAX) | NO | — | — |
| 8 | Error | nvarchar(MAX) | YES | — | — |
| 9 | Status | int | NO | — | — |
| 10 | DateCreated | datetime | NO | — | — |
| 11 | DateSent | datetime | YES | — | — |
| 12 | IsResend | bit | NO | — | — |
| 13 | CountryId | int | YES | — | — |

### EventType
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | — |
| 2 | Name | nvarchar(200) | NO | — | — |

### Facility
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | — |
| 2 | Title | nvarchar(200) | NO | — | — |
| 3 | IsActive | bit | NO | — | — |
| 4 | IconName | nvarchar(50) | YES | — | — |

### Fee
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | CountryID | int | NO | — | — |
| 3 | Hectare | int | NO | — | — |
| 4 | Price | decimal(19,2) | NO | — | — |
| 5 | HeritageFee | decimal(19,2) | NO | — | — |
| 6 | CommunityFee | decimal(19,2) | NO | — | — |
| 7 | InnovationFee | decimal(19,2) | NO | — | — |
| 8 | IsActive | bit | NO | — | — |
| 9 | DateCreated | datetime | NO | — | — |
| 10 | DateUpdated | datetime | NO | — | — |
| 11 | Currency | nvarchar(50) | NO | — | — |
| 12 | Vat | decimal(19,2) | NO | 0 | — |
| 13 | VatName | nvarchar(10) | NO | 'VAT' | — |

### Invoice
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | ParkAwardApplicationID | int | NO | — | — |
| 3 | ParkName | varchar(256) | NO | — | — |
| 4 | OrganisationName | varchar(256) | NO | — | — |
| 5 | Region | varchar(256) | YES | — | — |
| 6 | ContactName | varchar(256) | NO | — | — |
| 7 | ContactTelNo | varchar(120) | YES | — | — |
| 8 | FeeInvoiceName | nvarchar(256) | YES | — | — |
| 9 | FeeInvoiceAddressLine1 | varchar(256) | YES | — | — |
| 10 | FeeInvoiceAddressLine2 | varchar(256) | YES | — | — |
| 11 | FeeInvoiceAddressLine3 | varchar(256) | YES | — | — |
| 12 | FeeInvoicePostcode | varchar(256) | YES | — | — |
| 13 | PurchaseOrderNumber | varchar(256) | YES | — | — |
| 14 | TotalCost | decimal(19,2) | NO | — | — |
| 15 | DateCreated | datetime | YES | — | — |
| 16 | Email | varchar(500) | YES | — | — |

### InvoicingOrganisation
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | — |
| 2 | Name | nvarchar(500) | YES | — | — |
| 3 | Address | nvarchar(500) | YES | — | — |
| 4 | AdditionalInformation | nvarchar(MAX) | YES | — | — |
| 5 | Logo | nvarchar(200) | YES | — | — |
| 6 | MapPinLogo | nvarchar(200) | YES | — | — |
| 7 | MainPhone | nvarchar(20) | YES | — | — |
| 8 | MainEmailAddress | nvarchar(200) | YES | — | — |
| 9 | Website | nvarchar(200) | YES | — | — |
| 10 | KeyDates | nvarchar(MAX) | YES | — | — |
| 11 | Training | nvarchar(MAX) | YES | — | — |
| 12 | GuidanceManualPath | nvarchar(200) | YES | — | — |
| 13 | FilBookUrl | nvarchar(200) | YES | — | — |
| 14 | FeeText | nvarchar(MAX) | YES | — | — |
| 15 | HideFeeTable | bit | NO | 0 | — |

### InvoicingOrganisationTeam
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | FirstName | nvarchar(100) | YES | — | — |
| 3 | LastName | nvarchar(100) | YES | — | — |
| 4 | Email | nvarchar(200) | YES | — | — |
| 5 | Image | nvarchar(200) | YES | — | — |
| 6 | InvoicingOrganisationID | int | NO | — | — |
| 7 | Phone | nvarchar(20) | YES | — | — |

### Judge
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | FirstName | varchar(256) | YES | — | — |
| 3 | Surname | varchar(256) | YES | — | — |
| 4 | Email | varchar(128) | YES | — | — |
| 5 | AltEmail | varchar(128) | YES | — | — |
| 6 | MobileNumber | varchar(32) | YES | — | — |
| 7 | DayTimeTelephoneNumber | varchar(32) | YES | — | — |
| 8 | EveningNumber | varchar(32) | YES | — | — |
| 9 | AddressLine1 | varchar(512) | YES | — | — |
| 10 | AddressLine2 | varchar(512) | YES | — | — |
| 11 | AddressLine3 | varchar(512) | YES | — | — |
| 12 | Postcode | varchar(16) | YES | — | — |
| 13 | Latitude | decimal(18,6) | YES | — | — |
| 14 | Longitude | decimal(18,6) | YES | — | — |
| 15 | AddressNotes | varchar(1024) | YES | — | — |
| 16 | AllocationPostcode | varchar(16) | YES | — | — |
| 17 | AlternativeAddress | varchar(512) | YES | — | — |
| 18 | AlternativePostcode | varchar(512) | YES | — | — |
| 19 | OtherJudgingExperience | varchar(MAX) | YES | — | — |
| 20 | NumberOfGreenFlagAwardSitesPreparedToJudge | int | YES | — | — |
| 21 | NumberOfGreenPennantAwardSitesPreparedToJudge | int | YES | — | — |
| 22 | NumberOfGreenHeritageSitesPreparedToJudge | int | YES | — | — |
| 23 | IDCardIssued | bit | YES | — | — |
| 24 | JudgingStatus | int | YES | — | — |
| 25 | RegionID | int | YES | — | — |
| 26 | CountryID | int | YES | — | — |
| 27 | NearestTown | varchar(512) | YES | — | — |
| 28 | TravelRadius | int | YES | — | — |
| 29 | TravelRestrictions | varchar(256) | YES | — | — |
| 30 | OtherRegionsAvailableToJudge | varchar(512) | YES | — | — |
| 31 | PreferedJudgingRegion | varchar(512) | YES | — | — |
| 32 | WillingToJudgeOtherSites | bit | YES | — | — |
| 33 | YearParkExperienceStarted | int | YES | — | — |
| 34 | VolunteerAgreementReceived | bit | YES | — | — |
| 35 | IsMysteryShopper | bit | YES | — | — |
| 36 | NumberOfMysterySitesPreparedToJudge | int | YES | — | — |
| 37 | NumberOfMysterySitesAllocatedToJudge | int | YES | — | — |
| 38 | MysteryShopLocationPreferences | varchar(1024) | YES | — | — |
| 39 | PhotoSupplied | bit | YES | — | — |
| 40 | PersonalPhotoFileName | varchar(256) | YES | — | — |
| 41 | CVFileName | varchar(256) | YES | — | — |
| 42 | ApplicationFilename | varchar(256) | YES | — | — |
| 43 | CoverLetterFilename | varchar(256) | YES | — | — |
| 44 | UserAccessLevel | int | YES | — | — |
| 45 | CemeteriesAndCremetoriumExp | int | YES | — | — |
| 46 | HeritageSiteExp | int | YES | — | — |
| 47 | CountryParkExp | int | YES | — | — |
| 48 | NatureReserveExp | int | YES | — | — |
| 49 | UrbanParkExp | int | YES | — | — |
| 50 | GreenHeritageSiteInductionComplete | bit | YES | — | — |
| 51 | GreenFlagAwardInductionComplete | bit | YES | — | — |
| 52 | GreenPennantAwardInductionComplete | bit | YES | — | — |
| 53 | IsActive | bit | NO | 'True' | — |
| 54 | IsDeleted | bit | NO | 'False' | — |
| 55 | DateCreated | datetime | NO | getdate() | — |
| 56 | DateUpdated | datetime | NO | — | — |
| 57 | DateDeleted | datetime | YES | — | — |
| 58 | JudgeApplicationID | int | YES | — | — |
| 59 | NumberOfPrimaryParksAssigned | int | YES | — | — |
| 60 | NumberOfSecondaryParksAssigned | int | YES | — | — |
| 61 | NumberOfGreenFlagAwardSitesAllocated | int | YES | — | — |
| 62 | NumberOfGreenPennantAwardSitesAllocted | int | YES | — | — |
| 63 | NumberOfGreenHeritageSitesAllocated | int | YES | — | — |
| 64 | JudgeStatus | int | YES | — | — |
| 65 | LastDeclinedDate | datetime | YES | — | — |
| 66 | NumberOfGroupPreparedToJudge | int | YES | — | — |
| 67 | NumberOfGroupAllocatedToJudge | int | YES | — | — |
| 68 | EmergencyContactName | nvarchar(200) | YES | — | — |
| 69 | EmergencyTelephoneNumber | nvarchar(20) | YES | — | — |

### JudgeApplication
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | FirstName | varchar(256) | YES | — | — |
| 3 | Surname | varchar(256) | YES | — | — |
| 4 | Postcode | varchar(16) | YES | — | — |
| 5 | Email | varchar(256) | YES | — | — |
| 6 | CVFileName | varchar(256) | YES | — | — |
| 7 | ApplicationFilename | varchar(256) | YES | — | — |
| 8 | CoverLetterFilename | varchar(256) | YES | — | — |
| 9 | IsApproved | bit | YES | — | — |
| 10 | Notes | varchar(MAX) | YES | — | — |
| 11 | DateSubmitted | datetime | YES | — | — |
| 12 | DateApproved | datetime | YES | — | — |
| 13 | DateDeclined | datetime | YES | — | — |
| 14 | CountryID | int | YES | — | — |

### JudgeConflictOfInterest
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | JudgeID | int | NO | — | — |
| 3 | Conflict | varchar(256) | YES | — | — |
| 4 | IsActive | bit | YES | — | — |
| 5 | IsDeleted | bit | NO | 'False' | — |
| 6 | DateCreated | datetime | NO | getdate() | — |
| 7 | DateUpdated | datetime | YES | — | — |
| 8 | DateDeleted | datetime | YES | — | — |

### JudgeNote
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | AwardID | int | NO | — | — |
| 3 | JudgeID | int | NO | — | — |
| 4 | Reason | varchar(128) | NO | — | — |
| 5 | DateCreated | datetime | NO | — | — |

### Organisation
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | Name | nvarchar(800) | NO | — | — |
| 3 | AlternativeName | nvarchar(800) | YES | — | — |
| 4 | IsActive | bit | NO | — | — |
| 5 | IsDeleted | bit | NO | — | — |
| 6 | DateCreated | datetime | NO | — | — |
| 7 | DateUpdated | datetime | NO | — | — |
| 8 | DateDeleted | datetime | YES | — | — |
| 9 | CountryID | int | YES | — | — |
| 10 | RegionID | int | YES | — | — |

### Park
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | Title | nvarchar(256) | YES | — | — |
| 3 | AlternateTitle | nvarchar(256) | YES | — | — |
| 4 | Description | nvarchar(MAX) | YES | — | — |
| 5 | OrganisationID | int | YES | — | — |
| 6 | AddressLine1 | varchar(128) | YES | — | — |
| 7 | AddressLine2 | varchar(128) | YES | — | — |
| 8 | AddressLine3 | varchar(128) | YES | — | — |
| 9 | TownCity | varchar(64) | YES | — | — |
| 10 | Postcode | varchar(16) | YES | — | — |
| 11 | ParkWebsiteUrl | varchar(256) | YES | — | — |
| 12 | ParkTypeID | int | YES | — | — |
| 13 | RegionID | int | YES | — | — |
| 14 | CountyID | int | YES | — | — |
| 15 | CountryID | int | YES | — | — |
| 16 | AuthorityID | int | YES | — | — |
| 17 | Longitude | decimal(18,6) | YES | — | — |
| 18 | Latitude | decimal(18,6) | YES | — | — |
| 19 | ParkSize | decimal(10,2) | YES | — | — |
| 20 | ParkWalkTime | varchar(256) | YES | — | — |
| 21 | ParkTypeAdditionalInfo | varchar(255) | YES | — | — |
| 22 | ParkContractor | varchar(128) | YES | — | — |
| 23 | AverageYearlyVisitors | varchar(128) | YES | — | — |
| 24 | TrainingBudgetPerStaffMember | varchar(128) | YES | — | — |
| 25 | RevenueSpentLastYear | varchar(128) | YES | — | — |
| 26 | CapitalSpentLastYear | varchar(128) | YES | — | — |
| 27 | UnavailableJudgingDates | varchar(256) | YES | — | — |
| 28 | TotalVolunteers | varchar(128) | YES | — | — |
| 29 | TotalApprenticeVolunteers | varchar(128) | YES | — | — |
| 30 | TotalVolunteersHoursPerYear | varchar(128) | YES | — | — |
| 31 | TotalFullTimeStaff | varchar(128) | YES | — | — |
| 32 | TotalPartTimeStaff | varchar(128) | YES | — | — |
| 33 | AwardYearFirstApplied | varchar(256) | YES | — | — |
| 34 | SpecialAwardYearFirstApplied | varchar(256) | YES | — | — |
| 35 | WonGreenFlagAward | bit | YES | — | — |
| 36 | WonGreenPennantAward | bit | YES | — | — |
| 37 | WonGreenHeritageAward | bit | YES | — | — |
| 38 | WonSpecialInnovationAward | bit | YES | — | — |
| 39 | BecomeAFriend | varchar(512) | YES | — | — |
| 40 | ParkFacilities | varchar(MAX) | YES | — | — |
| 41 | IsActive | bit | NO | 'True' | — |
| 42 | IsDeleted | bit | NO | 'False' | — |
| 43 | DateCreated | datetime | NO | getdate() | — |
| 44 | DateUpdated | datetime | NO | — | — |
| 45 | DateDeleted | datetime | YES | — | — |
| 46 | Votes | int | YES | — | — |
| 47 | IsTrustProtected | bit | YES | — | — |
| 48 | IsShowingFlag | bit | NO | 0 | — |
| 49 | OpeningTimes | nvarchar(1000) | YES | — | — |
| 50 | IsShowingOnHomePage | bit | NO | 0 | — |
| 51 | AgreeShareManagementPlan | bit | YES | — | — |

### ParkApplicationNote
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | JudgeID | int | YES | — | — |
| 3 | DeskAssesment | decimal(18,2) | YES | — | — |
| 4 | FieldAssesment | decimal(18,2) | YES | — | — |
| 5 | Date | datetime | YES | — | — |
| 6 | ParkAwardApplicationID | int | YES | — | — |
| 7 | Status | int | YES | — | — |
| 8 | IsPassed | int | YES | — | — |
| 9 | FeedbackFile | varchar(256) | YES | — | — |
| 10 | IsScoreCompleted | bit | YES | — | — |
| 11 | TotalScore | int | YES | — | — |
| 12 | FormsValue | nvarchar(MAX) | YES | — | — |
| 13 | FormType | int | YES | — | — |
| 14 | ScoreSheetSubmitted | int | YES | — | — |
| 15 | FeedbackSubmitted | int | YES | — | — |
| 16 | PrimaryJudgeConfirmed | bit | YES | — | — |
| 17 | SecondaryJudgeConfirmed | bit | YES | — | — |
| 18 | IsResultsAnnounced | bit | NO | 0 | — |
| 19 | IsResultsLive | bit | NO | 0 | — |

### ParkAwardApplication *(129 columns — main application form)*
Key fields:
| # | Column | Type | Notes |
|---|--------|------|-------|
| 1 | ID | int IDENTITY | PK |
| 2 | ParkID | int | FK → Park |
| 3 | IsApprovedByAdmin | bit | — |
| 4–6 | DateCreated/Updated/Submitted | datetime | — |
| 7–8 | ParkTitle / ParkAlternateTitle | nvarchar(256) | — |
| 9 | OrganisationID | int | FK → Organisation |
| 11–15 | Address (4 lines + Postcode) | varchar(128/64/16) | — |
| 16 | RegionID | int | — |
| 17 | CountryID | int | — |
| 18 | AuthorityID | int | — |
| 19–21 | ContactName / TelNo / Email | varchar | — |
| 22 | ParkTypeID | int | — |
| 24 | ParkSize | decimal(10,2) | — |
| 28–47 | Primary & Secondary Contact Details | varchar(512) | Employer, address, etc. |
| 48 | QuailificationStatement | varchar(MAX) | — |
| 49 | PublicityStatement | varchar(MAX) | — |
| 50–52 | PhotoName1/2/3 | varchar(256) | — |
| 57–66 | Visitor/Staff/Volunteer stats | varchar(128) | — |
| 67–71 | LandOwner details | varchar(512) | — |
| 72–84 | Document file names (management plan, constitution, lease, insurance, etc.) | varchar(256) | — |
| 85–87 | Innovation Award fields | datetime/varchar | — |
| 88–92 | Invoice address | varchar | — |
| 93 | PurchaseOrderReference | varchar(256) | — |
| 94–96 | IsCurrentYearApplication, IsApplicationComplete, TotalCost | bit/decimal | — |
| 98 | IsMysteryShop | bit | — |
| 99 | IsPilot | bit | — |
| 100 | AwardTypeID | int | — |
| 101–102 | ParkMP / ParkConstituency | varchar(256) | — |
| 103–126 | Community group details (x4) | varchar | — |
| 127 | OpeningTimes | nvarchar(1000) | — |
| 128 | SeasonYear | int | — |
| 129 | IsManagementPlanRequired | bit | — |

### ParkDocument
Document filenames per park: ManagementPlan, ConstitutionPlan, Lease, FinancialStatements, PlanOfGreenSpace, Insurance, RiskAssessment, TravelDirections, ResponseToJudgesFeedBack, SiteConservationPlan, GHAResponseToJudgesFeedBack, InnovationAwardSupportingDoc, Photo1/2/3.

### ParkEvent
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | ParkID | int | NO | — | — |
| 3 | EventTitle | varchar(256) | NO | — | — |
| 4 | EventTypeID | int | YES | — | — |
| 5 | EventDescription | varchar(1024) | NO | — | — |
| 6 | ToDate | datetime | NO | — | — |
| 7 | FromDate | datetime | NO | — | — |
| 8 | IsActive | bit | NO | 1 | — |
| 9 | DateCreated | datetime | NO | — | — |
| 10 | DateDeleted | datetime | YES | — | — |

### ParkFacility
Junction: ParkID ↔ FacilityID

### ParksContact
Junction: ParkID ↔ ContactID

### ParksVote
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | ParkID | int | YES | — | — |
| 3 | IP | varchar(64) | YES | — | — |
| 4 | DateCreated | datetime | YES | — | — |

### ParkType
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | — |
| 2 | Type | nvarchar(200) | NO | — | — |
| 3 | IsActive | bit | NO | — | — |

### Region
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | — |
| 2 | Name | nvarchar(200) | NO | — | — |
| 3 | IsActive | bit | NO | — | — |
| 4 | CountryID | int | YES | — | — |

### ResetLog
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | DateCreated | datetime | NO | — | — |
| 3 | UserCreated | int | NO | — | — |
| 4 | CountryID | int | NO | — | — |

### ResourceDownloadLog
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | NodeId | int | NO | — | — |
| 3 | DateCreated | datetime | NO | — | — |
| 4 | Title | text | NO | — | — |
| 5 | LogId | uniqueidentifier | YES | — | — |

### ResourceDownloadLog1
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | Name | varchar(100) | NO | — | — |
| 3 | Organization | varchar(100) | YES | — | — |
| 4 | Email | varchar(100) | NO | — | — |
| 5 | CountryOfOrigin | varchar(100) | YES | — | — |
| 6 | NodeId | int | NO | — | — |
| 7 | DateCreated | datetime | NO | — | — |
| 8 | Title | text | NO | — | — |

### ResourceLog
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | LogId | uniqueidentifier | NO | — | — |
| 3 | FirstName | varchar(100) | NO | — | — |
| 4 | Organization | varchar(100) | YES | — | — |
| 5 | Email | varchar(100) | NO | — | — |
| 6 | CountryOfOrigin | varchar(100) | YES | — | — |
| 7 | Surname | varchar(100) | YES | — | — |
| 8 | Position | varchar(100) | YES | — | — |
| 9 | ContactingConsent | bit | YES | — | — |
| 10 | InformationConsent | bit | YES | — | — |
| 11 | DownloadTrigger | varchar(100) | YES | — | — |
| 12 | DateCreated | datetime | YES | — | — |

### Settings
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | KeyName | nvarchar(200) | NO | — | — |
| 3 | Value | nvarchar(200) | NO | — | — |

### User
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | UniqueID | int | NO | — | — |
| 3 | UserType | int | NO | — | — |
| 4 | Username | nvarchar(500) | NO | — | — |
| 5 | Password | nvarchar(500) | NO | — | — |
| 6 | IsActive | bit | NO | — | — |
| 7 | IsDeleted | bit | NO | — | — |
| 8 | DateCreated | datetime | NO | — | — |
| 9 | DateUpdated | datetime | NO | — | — |
| 10 | DateDeleted | datetime | YES | — | — |
| 11 | Status | int | YES | — | — |

### UserBlock
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | Username | nvarchar(256) | YES | — | — |
| 3 | IpAddress | nvarchar(50) | YES | — | — |
| 4 | DateBlock | datetime | YES | — | — |
| 5 | CheckNo | int | YES | — | — |
| 6 | IsBlock | bit | YES | — | — |
| 7 | DateStart | datetime | YES | — | — |

### ValidationToken
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | Token | uniqueidentifier | NO | — | — |
| 3 | DateCreated | datetime | NO | — | — |
| 4 | IsValid | bit | NO | — | — |
| 5 | UserId | int | NO | — | — |
| 6 | Type | int | YES | — | — |

---

## Research Centre (RC_*) Tables

### RC_Collaborator *(22 columns)*
Researcher profiles: FirstName, Surname, CountryID, OrganisationID, Position, social profiles (Twitter/Instagram/LinkedIn), ORCIDID, ProfessionalStatement, HighestEducationalQualification, consent flags.

### RC_ErrorLogs
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | ErrorLocation | varchar(100) | YES | — | — |
| 3 | ErrorMessage | nvarchar(MAX) | YES | — | — |

### RC_Item *(50 columns)*
Research items (papers, projects, events): ItemType, UploadedBy, ItemTitle, GeneralDescription, PreviewDescription, GeneralURL, LeadPerson, LeadOrganisation, PartnerOrganisations, CountryID, Funders, KeyFindingsSummary, ImplicationsAndPracticeSummary, Topics, DatePublished, DOIURL, ProjectID, Start/EndDate, CollaborationType, Status, ResearchMethodologies, ResearchAimsPurpose, consent flags.

### RC_LinkedOrganisation
Junction: OrganisationID ↔ LinkedOrganisationID

### RC_Organisation *(17 columns)*
Research organisations: Organisation, OrganisationUrl, CountryID, OrganisationType, social profiles, LogoUrl, Topics, MainContact, Status.

### RC_Project *(32 columns)*
Research projects: ProjectTitle, PrincipalResearcher, ProjectURL, LeadOrganisation, PartnerOrganisations, CountryID, Funders, Topics, DatePublished, LevelOfResearch, Start/EndDate, ProjectSummary, Status, consent flags.

### RC_Timezones
| # | Column | Type | Nullable | Default | Identity |
|---|--------|------|----------|---------|----------|
| 1 | ID | int | NO | — | IDENTITY |
| 2 | NAME | varchar(100) | NO | — | — |
| 3 | CURRENT_UTC_OFFSET | varchar(8) | NO | — | — |
| 4 | IS_CURRENTLY_DST | bit | NO | — | — |

---

## Umbraco CMS Tables (older version — Umbraco 7/8)
*(Same purpose as KBT_GFA but older schema version)*

Includes: cmsContent, cmsContentType, cmsContentVersion, cmsContentXml, cmsDataType, cmsDataTypePreValues, cmsDictionary, cmsDocument, cmsDocumentType, cmsLanguageText, cmsMacro, cmsMacroProperty, cmsMember, cmsMember2MemberGroup, cmsMemberType, cmsPreviewXml, cmsPropertyData, cmsPropertyType, cmsPropertyTypeGroup, cmsTagRelationship, cmsTags, cmsTask, cmsTaskType, cmsTemplate, umbracoAccess, umbracoAccessRule, umbracoCacheInstruction, umbracoDeployChecksum, umbracoDeployDependency, umbracoDomains, umbracoExternalLogin, umbracoLanguage, umbracoLog, umbracoMigration, umbracoNode, umbracoRedirectUrl, umbracoRelation, umbracoRelationType, umbracoServer, umbracoUser, umbracoUser2app, umbracoUser2NodeNotify, umbracoUser2NodePermission, umbracoUserType.

