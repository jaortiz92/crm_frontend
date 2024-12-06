export const basicModels = {
  task: {
    id_customer: null,
    id_responsible: null,
    id_creator: null,
    creation_date: null,
    task: null,
    completed: false,
    execution_date: null,
    comment: null
  },
  activity: {
    id_customer_trip: null,
    id_activity_type: null,
    id_user: null,
    estimated_date: null,
    execution_date: null,
    budget: 0,
    completed: false,
    execution_value: 0,
    comment: null,
    creation_date: null
  },
  order: {
    id_customer_trip: null,
    id_seller: null,
    date_order: null,
    id_payment_method: null,
    total_quantities: 0,
    system_quantities: 0,
    total_without_tax: 0,
    total_with_tax: 0,
    delivery_date: null
  },
  customerTrip: {
    id_customer: null,
    id_seller: null,
    id_collection: null,
    budget: null,
    ordered: false,
    comment: null
  },
  customer: {
    company_name: null,
    document: null,
    email: null,
    phone: null,
    id_store_type: null,
    address: null,
    id_brand: null,
    id_seller: null,
    stores: null,
    id_city: null,
    active: true,
    credit_limit: null,
    with_documents: false
  },
  contact: {
    id_customer: null,
    first_name: null,
    last_name: null,
    document: null,
    gender: null,
    email: null,
    phone: null,
    id_role: null,
    birth_date: null,
    id_city: null,
    active: true
  }
}
