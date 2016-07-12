define([
        'views/receipt_view',
        'pages/page',
        'utils/analytics_utils'
    ],
    function (ReceiptView,
              Page,
              AnalyticsUtils) {
        'use strict';

        return Page.extend({
            title: gettext('Receipt'),

            initialize: function () {
                AnalyticsUtils.analyticsSetUp();
                this.view = new ReceiptView();
                this.view.render();
            }
        });
    }
);
