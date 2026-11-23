const BasePage = require('./BasePage');

class HomePage extends BasePage {
  constructor(page) {
    super(page);
    // this.locators is auto-loaded from locators/HomePage.json by BasePage
  }

  async navigate() {
    await this.navigateTo('/');
  }

  async isHomepageDisplayed() {
    return await this.isVisible(this.locators.homepage);
  }
}

module.exports = HomePage;
