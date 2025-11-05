workspace {
  model {
    user = person "Customer" "End user of the platform"
    exampleWebsite = softwareSystem "Example Website" "Customer-facing frontend" {
      web = container "Web App" "React SPA" "React"
      api = container "Backend API" "Core service" "Node.js"
      db = container "Database" "Primary store" "SQLite"
    }
    payments = softwareSystem "Payments" "Handles payment processing" {
      paymentService = container "Payment Service" "Processes transactions" "Node.js"
    }

    user -> exampleWebsite "Uses"
    web -> api "Calls"
    api -> db "Reads/writes"
    api -> payments "Delegates payment to"
    paymentService -> api "Notifies"
  }
  views {
    systemLandscape "DomainLandscape" {
      include *
      title "Platform"
    }
    systemContext exampleWebsite "ExampleContext" {
      include *
      title "Example Website"
    }
    container exampleWebsite "ExampleContainers" {
      include *
      title "Example Website"
    }
    container payments "PaymentsContainers" {
      include *
      title "Payments"
    }
  }
}
