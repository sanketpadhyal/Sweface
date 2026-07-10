require("dotenv").config({ override: true });

const { syncEnvCompaniesToFirestore } = require("./firestoreCompanies");

async function seedCompanies() {
  const companies = await syncEnvCompaniesToFirestore();

  if (!companies.length) {
    throw new Error("No companies found. Add COMPANY_1_* values to .env.");
  }

  console.log(`Seeded ${companies.length} companies into Firestore.`);
  companies.forEach((company) => {
    console.log(`- ${company.id}: ${company.companyName} (${company.username})`);
  });
}

if (require.main === module) {
  seedCompanies()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  seedCompanies
};
