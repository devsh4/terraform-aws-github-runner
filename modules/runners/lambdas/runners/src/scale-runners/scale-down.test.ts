import { Octokit } from '@octokit/rest';
import { mocked } from 'jest-mock';
import moment from 'moment';
import nock from 'nock';

import * as ghAuth from '../gh-auth/gh-auth';
import { RunnerInfo, RunnerList, listEC2Runners, terminateRunner } from './../aws/runners';
import { githubCache } from './cache';
import { scaleDown } from './scale-down';

const mockOctokit = {
  apps: {
    getOrgInstallation: jest.fn(),
    getRepoInstallation: jest.fn(),
  },
  actions: {
    listSelfHostedRunnersForRepo: jest.fn(),
    listSelfHostedRunnersForOrg: jest.fn(),
    deleteSelfHostedRunnerFromOrg: jest.fn(),
    deleteSelfHostedRunnerFromRepo: jest.fn(),
    getSelfHostedRunnerForOrg: jest.fn(),
    getSelfHostedRunnerForRepo: jest.fn(),
  },
  paginate: jest.fn(),
};
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokit),
}));

jest.mock('./../aws/runners');
jest.mock('./../gh-auth/gh-auth');
jest.mock('./cache');

const mocktokit = Octokit as jest.MockedClass<typeof Octokit>;
const mockedAppAuth = mocked(ghAuth.createGithubAppAuth, { shallow: false });
const mockedInstallationAuth = mocked(ghAuth.createGithubInstallationAuth, { shallow: false });
const mockCreateClient = mocked(ghAuth.createOctoClient, { shallow: false });
const mockListRunners = mocked(listEC2Runners);

export interface TestData {
  repositoryName: string;
  repositoryOwner: string;
}

const cleanEnv = process.env;

const environment = 'unit-test-environment';
const minimumRunningTimeInMinutes = 15;
const runnerBootTimeInMinutes = 5;
const TEST_DATA: TestData = {
  repositoryName: 'hello-world',
  repositoryOwner: 'Codertocat',
};

let DEFAULT_RUNNERS: RunnerList[];
let RUNNERS_ALL_REMOVED: RunnerInfo[];
let DEFAULT_RUNNERS_REPO_TO_BE_REMOVED: RunnerInfo[];
let RUNNERS_ORG_TO_BE_REMOVED_WITH_AUTO_SCALING_CONFIG: RunnerInfo[];
let RUNNERS_REPO_WITH_AUTO_SCALING_CONFIG: RunnerInfo[];
let RUNNERS_ORG_WITH_AUTO_SCALING_CONFIG: RunnerInfo[];
let DEFAULT_RUNNERS_REPO: RunnerInfo[];
let DEFAULT_RUNNERS_ORG: RunnerInfo[];
let DEFAULT_RUNNERS_ORG_TO_BE_REMOVED: RunnerInfo[];
let DEFAULT_RUNNERS_ORPHANED: RunnerInfo[];
let DEFAULT_REPO_RUNNERS_ORPHANED: RunnerInfo[];
let DEFAULT_ORG_RUNNERS_ORPHANED: RunnerInfo[];
const DEFAULT_RUNNERS_ORIGINAL = [
  {
    instanceId: 'i-idle-101',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes + 5, 'minutes')
      .toDate(),
    type: 'Repo',
    owner: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
  },
  {
    instanceId: 'i-idle-102',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes + 3, 'minutes')
      .toDate(),
    type: 'Org',
    owner: TEST_DATA.repositoryOwner,
  },
  {
    instanceId: 'i-oldest-idle-103',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes + 27, 'minutes')
      .toDate(),
    type: 'Repo',
    owner: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
  },
  {
    instanceId: 'i-oldest-idle-104',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes + 27, 'minutes')
      .toDate(),
    type: 'Org',
    owner: TEST_DATA.repositoryOwner,
  },
  {
    instanceId: 'i-running-105',
    launchTime: moment(new Date()).subtract(25, 'minutes').toDate(),
    type: 'Repo',
    owner: `doe/another-repo`,
  },
  {
    instanceId: 'i-running-106',
    launchTime: moment(new Date()).subtract(25, 'minutes').toDate(),
    type: 'Org',
    owner: TEST_DATA.repositoryOwner,
  },
  {
    instanceId: 'i-orphan-107',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes + 5, 'minutes')
      .toDate(),
    type: 'Repo',
    owner: `doe/another-repo`,
  },
  {
    instanceId: 'i-not-registered-108',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes - 1, 'minutes')
      .toDate(),
    type: 'Repo',
    owner: `doe/another-repo`,
  },
  {
    instanceId: 'i-not-registered-109',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes - 2, 'minutes')
      .toDate(),
    type: 'Org',
    owner: TEST_DATA.repositoryOwner,
  },
  {
    instanceId: 'i-legacy-110',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes + 5, 'minutes')
      .toDate(),
    repo: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
  },
  {
    instanceId: 'i-new-111',
    launchTime: moment(new Date()).toDate(),
    repo: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
  },
  {
    instanceId: 'i-running-112',
    launchTime: moment(new Date()).subtract(25, 'minutes').toDate(),
    type: 'Repo',
    owner: `doe/another-repo`,
  },
  {
    instanceId: 'i-running-113',
    launchTime: moment(new Date()).subtract(25, 'minutes').toDate(),
    type: 'Org',
    owner: TEST_DATA.repositoryOwner,
  },
];

const DEFAULT_REGISTERED_RUNNERS = [
  {
    id: 101,
    name: 'i-idle-101',
  },
  {
    id: 102,
    name: 'i-idle-102',
  },
  {
    id: 103,
    name: 'i-oldest-idle-103',
  },
  {
    id: 104,
    name: 'i-oldest-idle-104',
  },
  {
    id: 105,
    name: 'i-running-105',
  },
  {
    id: 106,
    name: 'i-running-106',
  },
  {
    id: 1121,
    name: 'i-running-112-1',
  },
  {
    id: 1122,
    name: 'i-running-112-2',
  },
  {
    id: 1131,
    name: 'i-running-113-1',
  },
  {
    id: 1132,
    name: 'i-running-113-2',
  },
];

describe('scaleDown', () => {
  beforeEach(() => {
    process.env = { ...cleanEnv };
    process.env.GITHUB_APP_KEY_BASE64 = 'TEST_CERTIFICATE_DATA';
    process.env.GITHUB_APP_ID = '1337';
    process.env.GITHUB_APP_CLIENT_ID = 'TEST_CLIENT_ID';
    process.env.GITHUB_APP_CLIENT_SECRET = 'TEST_CLIENT_SECRET';
    process.env.RUNNERS_MAXIMUM_COUNT = '3';
    process.env.SCALE_DOWN_CONFIG = '[]';
    process.env.ENVIRONMENT = environment;
    process.env.MINIMUM_RUNNING_TIME_IN_MINUTES = minimumRunningTimeInMinutes.toString();
    process.env.RUNNER_BOOT_TIME_IN_MINUTES = runnerBootTimeInMinutes.toString();
    nock.disableNetConnect();
    jest.clearAllMocks();
    jest.resetModules();
    githubCache.clients.clear();
    githubCache.runners.clear();
    mockOctokit.apps.getOrgInstallation.mockImplementation(() => ({
      data: {
        id: 'ORG',
      },
    }));
    mockOctokit.apps.getRepoInstallation.mockImplementation(() => ({
      data: {
        id: 'REPO',
      },
    }));

    mockOctokit.paginate.mockResolvedValue(DEFAULT_REGISTERED_RUNNERS);
    mockOctokit.actions.deleteSelfHostedRunnerFromRepo.mockImplementation((repo) => {
      if (repo.runner_id === 105) {
        throw Error();
      } else {
        return { status: 204 };
      }
    });
    mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockImplementation((repo) => {
      if (repo.runner_id === 106) {
        throw Error();
      } else {
        return { status: 204 };
      }
    });

    mockOctokit.actions.getSelfHostedRunnerForRepo.mockImplementation((repo) => {
      if (repo.runner_id === 1121) {
        return {
          data: { busy: true },
        };
      } else {
        return {
          data: { busy: false },
        };
      }
    });
    mockOctokit.actions.getSelfHostedRunnerForOrg.mockImplementation((repo) => {
      if (repo.runner_id === 1131) {
        return {
          data: { busy: true },
        };
      } else {
        return {
          data: { busy: false },
        };
      }
    });

    const mockTerminateRunners = mocked(terminateRunner);
    mockTerminateRunners.mockImplementation(async () => {
      return;
    });
    mockedAppAuth.mockResolvedValue({
      type: 'app',
      token: 'token',
      appId: 1,
      expiresAt: 'some-date',
    });
    mockedInstallationAuth.mockResolvedValue({
      type: 'token',
      tokenType: 'installation',
      token: 'token',
      createdAt: 'some-date',
      expiresAt: 'some-date',
      permissions: {},
      repositorySelection: 'all',
      installationId: 0,
    });
    mockCreateClient.mockResolvedValue(new mocktokit());
    DEFAULT_RUNNERS = JSON.parse(JSON.stringify(DEFAULT_RUNNERS_ORIGINAL));
    DEFAULT_RUNNERS_REPO = DEFAULT_RUNNERS.filter((r) => r.type === 'Repo') as RunnerInfo[];
    DEFAULT_RUNNERS_ORG = DEFAULT_RUNNERS.filter((r) => r.type === 'Org') as RunnerInfo[];
    DEFAULT_RUNNERS_REPO_TO_BE_REMOVED = DEFAULT_RUNNERS_REPO.filter(
      (r) => r.instanceId.includes('idle') || r.instanceId.includes('orphan'),
    );
    DEFAULT_RUNNERS_ORG_TO_BE_REMOVED = DEFAULT_RUNNERS_ORG.filter(
      (r) => r.instanceId.includes('idle') || r.instanceId.includes('orphan'),
    );

    RUNNERS_REPO_WITH_AUTO_SCALING_CONFIG = DEFAULT_RUNNERS_REPO.filter(
      (r) => r.instanceId.includes('idle') || r.instanceId.includes('running'),
    );

    RUNNERS_ORG_WITH_AUTO_SCALING_CONFIG = DEFAULT_RUNNERS_ORG.filter(
      (r) => r.instanceId.includes('idle') || r.instanceId.includes('running'),
    );

    RUNNERS_ORG_TO_BE_REMOVED_WITH_AUTO_SCALING_CONFIG = DEFAULT_RUNNERS_ORG.filter((r) =>
      r.instanceId.includes('oldest'),
    );

    RUNNERS_ALL_REMOVED = DEFAULT_RUNNERS_ORG.filter(
      (r) => !r.instanceId.includes('running') && !r.instanceId.includes('registered'),
    );
    DEFAULT_RUNNERS_ORPHANED = DEFAULT_RUNNERS_ORIGINAL.filter(
      (r) => r.instanceId.includes('orphan') && !r.instanceId.includes('not-registered'),
    ) as RunnerInfo[];
    DEFAULT_REPO_RUNNERS_ORPHANED = DEFAULT_RUNNERS_REPO.filter(
      (r) => r.instanceId.includes('orphan') && !r.instanceId.includes('not-registered'),
    );
    DEFAULT_ORG_RUNNERS_ORPHANED = DEFAULT_RUNNERS_ORG.filter(
      (r) => r.instanceId.includes('orphan') && !r.instanceId.includes('not-registered'),
    );
  });

  describe('github.com', () => {
    describe('no runners running', () => {
      beforeEach(() => {
        mockListRunners.mockResolvedValue([]);
      });

      it('No runners online', async () => {
        await scaleDown();
        expect(listEC2Runners).toBeCalledWith({
          environment: environment,
        });
        expect(terminateRunner).not;
        expect(mockOctokit.apps.getRepoInstallation).not;
        expect(mockOctokit.apps.getRepoInstallation).not;
      });
    });

    it('Terminates 3 of 5 runners owned by repos and all orphaned', async () => {
      mockListRunners.mockResolvedValue(DEFAULT_RUNNERS_REPO);
      await scaleDown();
      expect(listEC2Runners).toBeCalledWith({
        environment: environment,
      });

      expect(mockOctokit.apps.getRepoInstallation).toBeCalled();

      expect(terminateRunner).toBeCalledTimes(4);
      for (const toTerminate of DEFAULT_RUNNERS_REPO_TO_BE_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
      }
      for (const toTerminate of DEFAULT_REPO_RUNNERS_ORPHANED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
      }
    });

    it('Terminates 2 of 3 runners owned by orgs and all orphaned', async () => {
      mockListRunners.mockResolvedValue(DEFAULT_RUNNERS_ORG);
      await scaleDown();
      expect(listEC2Runners).toBeCalledWith({
        environment: environment,
      });

      expect(mockOctokit.apps.getOrgInstallation).toBeCalled();
      expect(terminateRunner).toBeCalledTimes(3);
      for (const toTerminate of DEFAULT_RUNNERS_ORG_TO_BE_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
      }
      for (const toTerminate of DEFAULT_ORG_RUNNERS_ORPHANED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
      }
    });

    describe('With idle config', () => {
      beforeEach(() => {
        process.env.SCALE_DOWN_CONFIG = JSON.stringify([
          {
            idleCount: 3,
            cron: '* * * * * *',
            timeZone: 'Europe/Amsterdam',
          },
        ]);
      });

      it('Terminates 1 runner owned by orgs', async () => {
        mockListRunners.mockResolvedValue(RUNNERS_ORG_WITH_AUTO_SCALING_CONFIG);
        await scaleDown();

        expect(listEC2Runners).toBeCalledWith({
          environment: environment,
        });

        expect(mockOctokit.apps.getOrgInstallation).toBeCalled();
        expect(terminateRunner).toBeCalledTimes(1);
        for (const toTerminate of RUNNERS_ORG_TO_BE_REMOVED_WITH_AUTO_SCALING_CONFIG) {
          expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
        }
      });

      it('Terminates 0 runners owned by org', async () => {
        mockListRunners.mockResolvedValue(RUNNERS_REPO_WITH_AUTO_SCALING_CONFIG);
        process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
        await scaleDown();

        expect(listEC2Runners).toBeCalledWith({
          environment: environment,
        });

        expect(mockOctokit.apps.getRepoInstallation).toBeCalled();
        expect(terminateRunner).not.toBeCalled();
      });
    });

    it('No instances terminates when delete runner in github results in a non 204 status.', async () => {
      mockListRunners.mockResolvedValue(DEFAULT_RUNNERS);
      mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockImplementation(() => {
        return { status: 500 };
      });

      await scaleDown();

      expect(listEC2Runners).toBeCalledWith({
        environment: environment,
      });

      expect(mockOctokit.apps.getOrgInstallation).toBeCalled();
      expect(terminateRunner).not.toBeCalled;
    });

    it('Terminates 6 runners amongst all owners and all orphaned', async () => {
      mockListRunners.mockResolvedValue(DEFAULT_RUNNERS);
      await scaleDown();

      expect(listEC2Runners).toBeCalledWith({
        environment: environment,
      });

      expect(mockOctokit.apps.getRepoInstallation).toBeCalledTimes(2);
      expect(mockOctokit.apps.getOrgInstallation).toBeCalledTimes(1);
      expect(terminateRunner).toBeCalledTimes(7);
      for (const toTerminate of RUNNERS_ALL_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
      }
      for (const toTerminate of DEFAULT_RUNNERS_ORPHANED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
      }
    });
  });

  describe('ghes', () => {
    beforeEach(() => {
      process.env.GHES_URL = 'https://github.enterprise.something';
    });
    describe('no runners running', () => {
      beforeEach(() => {
        mockListRunners.mockResolvedValue([]);
      });

      it('No runners online', async () => {
        await scaleDown();
        expect(listEC2Runners).toBeCalledWith({
          environment: environment,
        });
        expect(terminateRunner).not;
        expect(mockOctokit.apps.getRepoInstallation).not;
        expect(mockOctokit.apps.getRepoInstallation).not;
      });
    });

    it('Terminates 3 of 5 runners owned by repos and all orphaned', async () => {
      mockListRunners.mockResolvedValue(DEFAULT_RUNNERS_REPO);
      await scaleDown();
      expect(listEC2Runners).toBeCalledWith({
        environment: environment,
      });

      expect(mockOctokit.apps.getRepoInstallation).toBeCalled();
      expect(terminateRunner).toBeCalledTimes(4);
      for (const toTerminate of DEFAULT_RUNNERS_REPO_TO_BE_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
      }
      for (const toTerminate of DEFAULT_REPO_RUNNERS_ORPHANED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
      }
    });

    it('Terminates 2 of 3 runners owned by orgs and all orphaned', async () => {
      mockListRunners.mockResolvedValue(DEFAULT_RUNNERS_ORG);
      await scaleDown();
      expect(listEC2Runners).toBeCalledWith({
        environment: environment,
      });

      expect(mockOctokit.apps.getOrgInstallation).toBeCalled();
      expect(terminateRunner).toBeCalledTimes(3);
      for (const toTerminate of DEFAULT_RUNNERS_ORG_TO_BE_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
      }
      for (const toTerminate of DEFAULT_ORG_RUNNERS_ORPHANED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
      }
    });

    describe('With idle config', () => {
      beforeEach(() => {
        process.env.SCALE_DOWN_CONFIG = JSON.stringify([
          {
            idleCount: 3,
            cron: '* * * * * *',
            timeZone: 'Europe/Amsterdam',
          },
        ]);
      });

      it('Terminates 1 runner owned by orgs', async () => {
        mockListRunners.mockResolvedValue(RUNNERS_ORG_WITH_AUTO_SCALING_CONFIG);
        await scaleDown();

        expect(listEC2Runners).toBeCalledWith({
          environment: environment,
        });

        expect(mockOctokit.apps.getOrgInstallation).toBeCalled();
        expect(terminateRunner).toBeCalledTimes(1);
        for (const toTerminate of RUNNERS_ORG_TO_BE_REMOVED_WITH_AUTO_SCALING_CONFIG) {
          expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
        }
      });

      it('Terminates 0 runners owned by repos', async () => {
        mockListRunners.mockResolvedValue(RUNNERS_REPO_WITH_AUTO_SCALING_CONFIG);
        process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
        await scaleDown();

        expect(listEC2Runners).toBeCalledWith({
          environment: environment,
        });

        expect(mockOctokit.apps.getRepoInstallation).toBeCalled();
        expect(terminateRunner).not.toBeCalled();
      });
    });

    it('Terminates 6 runners amongst all owners and all orphaned', async () => {
      mockListRunners.mockResolvedValue(DEFAULT_RUNNERS);
      await scaleDown();

      expect(listEC2Runners).toBeCalledWith({
        environment: environment,
      });

      expect(mockOctokit.apps.getRepoInstallation).toBeCalledTimes(2);
      expect(mockOctokit.apps.getOrgInstallation).toBeCalledTimes(1);
      expect(terminateRunner).toBeCalledTimes(7);
      for (const toTerminate of RUNNERS_ALL_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
      }
      for (const toTerminate of DEFAULT_RUNNERS_ORPHANED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
      }
    });
  });
});
