const BasePage = require('./BasePage');

class LoginPage extends BasePage {
  constructor(page) {
    super(page);
    // this.locators is auto-loaded from locators/LoginPage.json by BasePage
  }

  /**
   * Click on Login menu
   */
  async clickLoginMenu() {
    await this.click(this.locators.loginMenuLink);
    await this.waitForElement(this.locators.loginModal);
  }

  /**
   * Check if login modal is visible
   * @returns {boolean}
   */
  async isLoginModalVisible() {
    return await this.isVisible(this.locators.loginModal);
  }

  /**
   * Enter username in login modal
   * @param {string} username - Username to enter
   */
  async enterUsername(username) {
    await this.fill(this.locators.usernameField, username);
  }

  /**
   * Enter password in login modal
   * @param {string} password - Password to enter
   */
  async enterPassword(password) {
    await this.fill(this.locators.passwordField, password);
  }

  /**
   * Click login button
   */
  async clickLoginButton() {
    await this.click(this.locators.loginButton);
  }

  /**
   * Perform complete login
   * @param {string} username - Username
   * @param {string} password - Password
   */
  async login(username, password) {
    await this.clickLoginMenu();
    await this.enterUsername(username);
    await this.enterPassword(password);
    await this.clickLoginButton();
  }

  /**
   * Close login modal
   */
  async closeLoginModal() {
    await this.click(this.locators.closeButton);
  }
}

module.exports = LoginPage;
