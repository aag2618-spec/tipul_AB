SELECT tablename, COUNT(*) AS new_index_count
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    indexname LIKE '%_trgm_idx'
    OR indexname IN (
      'Client_therapistId_idx',
      'Client_therapistId_status_isQuickClient_idx',
      'Client_organizationId_status_isQuickClient_idx',
      'Client_organizationId_updatedAt_idx',
      'TherapySession_therapistId_startTime_idx',
      'TherapySession_therapistId_status_startTime_idx',
      'TherapySession_clientId_startTime_idx',
      'TherapySession_organizationId_status_startTime_idx',
      'Payment_organizationId_status_parentPaymentId_paidAt_idx',
      'Payment_organizationId_status_parentPaymentId_createdAt_idx',
      'Payment_clientId_status_parentPaymentId_idx',
      'Notification_type_status_createdAt_idx',
      'Task_userId_status_type_idx',
      'Task_userId_relatedEntityId_type_status_idx',
      'Task_userId_dueDate_idx',
      'CommunicationLog_sessionId_type_channel_status_idx',
      'CommunicationLog_userId_createdAt_idx',
      'CommunicationLog_userId_clientId_type_channel_status_createdAt_idx',
      'CommunicationLog_createdAt_type_idx',
      'CommunicationLog_messageId_idx',
      'SubscriptionPayment_userId_createdAt_idx',
      'SubscriptionPayment_status_createdAt_idx',
      'CardcomTransaction_status_lowProfileId_createdAt_idx',
      'AdminAlert_type_userId_status_idx',
      'ConsentForm_organizationId_isTemplate_createdAt_idx',
      'CardcomInvoice_paymentId_idx',
      'idx_chatmessage_attachmentpath'
    )
  )
GROUP BY tablename
ORDER BY tablename;
