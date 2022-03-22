import assert from 'assert/strict';
import github from '@actions/github';
import core from '@actions/core';
import { request } from 'undici';

import config from './config.js';

class Notifier {
  constructor(options, config) {
    this.options = options;
    this.config = config;

    // assert(this.options.token, 'github token is required');
    this.octokit = github.getOctokit(this.options.token || process.env.ghtoken);
    this.options.owner = this.options.owner || 'atian25';
    this.options.repo = this.options.repo || 'npm-release-notifier';
  }

  async run() {
    const result = {};
    const packages = this.config.packages;

    // find issues, extract lastChecked
    const { data: issues } = await this.octokit.rest.issues.listForRepo({
      owner: this.options.owner,
      repo: this.options.repo,
      state: 'open',
    });

    for (const pkgName of packages) {
      result[pkgName] = {
        name: pkgName,
      };

      const issue = issues.find(item => item.title === pkgName);
      if (issue) {
        result[pkgName].issue = {
          number: issue.number,
          title: issue.title,
          labels: issue.labels.map(obj => obj.name),
          updated_at: issue.updated_at,
          body: issue.body,
        };
      }
    }


    // check each package
    for (const pkgName of packages) {
      const url = `https://registry.npmjs.com/${pkgName}`;
      const { body } = await request(url);
      const pkgInfo = await body.json();
      for (const [ version, time ] of Object.entries(pkgInfo.time)) {
        if (version === 'modified' || version === 'created') continue;
        if (new Date(time) > new Date(this.config.lastChecked)) {
          result[pkgName].updated = {
            version,
            time,
          };
        }
      }
    }

    return result;
  }


  async getNpmUpdatedInfo(name) {
    const url = `https://registry.npmjs.com/${name}`;
    const { body } = await request(url);
    const pkgInfo = await body.json();
    const result = Object.entries(pkgInfo.time).filter(([ version ]) => {
      return version !== 'modified' || version !== 'created';
    });
    return result;
  }

  async check(name) {
    // fetch pkgInfo
    const url = `https://registry.npmjs.com/${name}`;
    const { body } = await request(url);
    const pkgInfo = await body.json();

    // filter updated versions
    const result = Object.entries(pkgInfo.time).filter(([ version, time ]) => {
      if (version === 'modified' || version === 'created') return false;
      // console.log(time, version, new Date(time) > new Date(config.lastChecked))
      return new Date(time) > new Date(this.config.lastChecked);
    });
    return result;
  }

  async notify(result) {
    // const { data } = await this.octokit.rest.issues.get({
    //   owner: 'atian25',
    //   repo: 'blog',
    //   issue_number: 100,
    // });

    const { data } = await this.octokit.rest.issues.listForRepo({
      owner: 'atian25',
      repo: 'npm-release-notifier',
      state: 'open',
    });
    console.log(data)
    // console.log(data.map(item => [item.title, item.number, item.labels.map(label => label.name)]));
    // update lastChecked
    // create/update issue
    // comment on issue
  }
}

const instance = new Notifier({}, config);

instance.run().catch(err => {
  console.error(err);
  core.setFailed(err.message);
  process.exit(1);
});
