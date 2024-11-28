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
  }
}
