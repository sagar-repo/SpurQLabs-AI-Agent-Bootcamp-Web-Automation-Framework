@Cart @Regression
Feature: Cart isolation between visitors
  As a visitor of the Demoblaze application
  I want my cart to contain only the items I added
  So that I never see another visitor's products

  @DMSA-TC-001 @Cart @HappyPath @AC-P1
  Scenario: Automated - DMSA-TC-001: Verify cart is empty when the home page is opened before the cart
    Given User navigates to Demoblaze application
    Then User should see the home page product grid
    When User opens the cart from the header
    Then User should be on the cart page
    When User waits for the cart to finish loading
    Then User should see no product rows in the cart

  @DMSA-TC-002 @Cart @HappyPath @AC-P2
  Scenario: Automated - DMSA-TC-002: Verify only Nexus 6 is listed after adding it from a fresh session
    Given User navigates to Demoblaze application
    Then User should see the home page product grid
    When User opens phone product "Nexus 6" from the product grid
    Then User should see product details for "Nexus 6"
    When User adds the product to the cart
    Then User should see the cart confirmation alert
    When User opens the cart from the header
    Then User should be on the cart page
    When User waits for the cart to finish loading
    Then User should see only "Nexus 6" in the cart
