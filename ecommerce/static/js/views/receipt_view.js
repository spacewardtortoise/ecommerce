define([
        'jquery',
        'jquery-ajax-retry',
        'backbone',
        'underscore',
        'bootstrap',
        'jquery-url'
    ],
function ($, AjaxRetry, Backbone, _) {
    'use strict';

    return Backbone.View.extend({
        useEcommerceApi: true,
        ecommerceBasketId: null,
        ecommerceOrderNumber: null,
        el: '#receipt-container',

        initialize: function () {
            this.ecommerceBasketId = $.url('?basket_id');
            this.ecommerceOrderNumber = $.url('?order_number');
            this.useEcommerceApi = this.ecommerceBasketId || this.ecommerceOrderNumber;
            _.bindAll(this, 'renderReceipt', 'renderError', 'getProviderData', 'renderProvider');
        },

        renderReceipt: function (data) {
            var templateHtml = $("#receipt-tpl").html(),
                context = {
                    platformName: this.$el.data('platform-name'),
                    verified: this.$el.data('verified') === 'true',
                    lmsUrl: this.$el.data('lms-url')
                    // is_request_in_themed_site: this.$el.data('is-request-in-themed-site').toLowerCase() === 'true'
                },
                providerId;

            // Add the receipt info to the template context
            this.courseKey = this.getOrderCourseKey(data);
            this.username = this.$el.data('username');
            _.extend(context, {
                receipt: this.receiptContext(data),
                courseKey: this.courseKey
            });

            this.$el.html(_.template(templateHtml)(context));
            this.trackLinks();
            this.trackPurchase(data);
            providerId = this.getCreditProviderId(data);
            if (providerId) {
                this.getProviderData(this.$el.data('lms-url'), providerId).then(this.renderProvider, this.renderError);
            }
            return this;
        },
        renderCourseNamePlaceholder: function (courseId) {
            // Display the course Id or name (if available) in the placeholder
            var $courseNamePlaceholder = $(".course_name_placeholder");
            $courseNamePlaceholder.text(courseId);

            this.getCourseData(courseId).then(function (responseData) {
                $courseNamePlaceholder.text(responseData.name);
            });
        },
        // ACTUALLY CALLED
        renderUserFullNamePlaceholder: function (username) {
            var userModel = Backbone.Model.extend({
              urlRoot: '/api/user/v1/accounts/',
                url: function() {
                    return this.urlRoot + this.id;
                }
            });
            this.user = new userModel({id:username});
            this.user.fetch({success: function(userData) {
                $(".full_name_placeholder").text(userData.get('name'));
            }});
        },
        renderProvider: function (context) {
            var templateHtml = $("#provider-tpl").html(),
                providerDiv = this.$el.find("#receipt-provider");
            context.course_key = this.courseKey;
            context.username = this.username;
            context.platformName = this.$el.data('platform-name');
            console.log('Provider context: ' + context);
            console.log('Provider HTML: ' + templateHtml);
            providerDiv.html(_.template(templateHtml)(context)).removeClass('hidden');
        },

        renderError: function () {
            // Display an error
            $('#error-container').removeClass('hidden');
        },

        trackPurchase: function (order) {
            window.analytics.track("Completed Order", {
                orderId: order.number,
                total: order.total_excl_tax,
                currency: order.currency
            });
        },

        render: function () {
            var self = this,
                orderId = this.ecommerceOrderNumber || this.ecommerceBasketId || $.url('?payment-order-num');

            if (orderId) {
                // Get the order details
                self.$el.removeClass('hidden');
                self.getReceiptData(orderId).then(self.renderReceipt, self.renderError);
            } else {
                self.renderError();
            }
        },

        trackLinks: function () {
            var $verifyNowButton = $('#verify_now_button'),
                $verifyLaterButton = $('#verify_later_button');

            // Track a virtual pageview, for easy funnel reconstruction.
            window.analytics.page('payment', 'receipt');

            // Track the user's decision to verify immediately
            window.analytics.trackLink($verifyNowButton, 'edx.bi.user.verification.immediate', {
                category: 'verification'
            });

            // Track the user's decision to defer their verification
            window.analytics.trackLink($verifyLaterButton, 'edx.bi.user.verification.deferred', {
                category: 'verification'
            });
        },

        /**
         * Retrieve receipt data from Oscar (via LMS).
         * @param  {string} orderId Identifier of the order that was purchased.
         * @return {object} JQuery Promise.
         */
        getReceiptData: function (orderId) {
            var urlFormat = '/api/v2/orders/' + orderId;

            if (this.ecommerceOrderNumber) {
                urlFormat = '/api/v2/orders/' + orderId + '/';
            } else if (this.ecommerceBasketId){
                urlFormat = '/api/v2/baskets/' + orderId + '/order/';
            }

            return $.ajax({
                url: urlFormat,
                type: 'GET',
                dataType: 'json'
            }).retry({times: 5, timeout: 2000, statusCodes: [404]});
        },
        /**
         * Retrieve credit provider data from LMS.
         * @param  {string} lmsUrl The base url of the LMS instance.
         * @param  {string} providerId The providerId of the credit provider.
         * @return {object} JQuery Promise.
         */
        getProviderData: function (lmsUrl, providerId) {
            var providerBaseUrl = lmsUrl + '/api/credit/v1/providers/';

            return $.ajax({
                url: providerBaseUrl +  providerId,
                type: 'GET',
                dataType: 'json',
                contentType: 'application/json',
                headers: {
                    'X-CSRFToken': $.cookie('csrftoken')
                }
            }).retry({times: 5, timeout: 2000, statusCodes: [404]});
        },

        /**
         * Construct the template context from data received
         * from the E-Commerce API.
         *
         * @param  {object} order Receipt data received from the server
         * @return {object} Receipt template context.
         */
        receiptContext: function (order) {
            var self = this,
                receiptContext;

            console.log("Order: " + JSON.stringify(order));

            if (this.useEcommerceApi) {
                console.log('Using E-Commerce API');
                receiptContext = {
                    orderNum: order.number,
                    currency: order.currency,
                    email: order.user.email,
                    vouchers: order.vouchers,
                    payment_processor: order.payment_processor,
                    purchasedDatetime: order.date_placed,
                    totalCost: self.formatMoney(order.total_excl_tax),
                    isRefunded: false,
                    items: [],
                    billedTo: null
                };

                if (order.billing_address) {
                    receiptContext.billedTo = {
                        firstName: order.billing_address.first_name,
                        lastName: order.billing_address.last_name,
                        city: order.billing_address.city,
                        state: order.billing_address.state,
                        postalCode: order.billing_address.postcode,
                        country: order.billing_address.country
                    }
                }

                receiptContext.items = _.map(
                    order.lines,
                    function (line) {
                        return {
                            lineDescription: line.description,
                            cost: self.formatMoney(line.line_price_excl_tax)
                        };
                    }
                );
            } else {
                console.log('Not using ECommerce. CHECK WHY');
                receiptContext = {
                    orderNum: order.orderNum,
                    currency: order.currency,
                    purchasedDatetime: order.purchase_datetime,
                    totalCost: self.formatMoney(order.total_cost),
                    isRefunded: order.status === "refunded",
                    billedTo: {
                        firstName: order.billed_to.first_name,
                        lastName: order.billed_to.last_name,
                        city: order.billed_to.city,
                        state: order.billed_to.state,
                        postalCode: order.billed_to.postal_code,
                        country: order.billed_to.country
                    },
                    items: []
                };

                receiptContext.items = _.map(
                    order.items,
                    function (item) {
                        return {
                            lineDescription: item.line_desc,
                            cost: self.formatMoney(item.line_cost)
                        };
                    }
                );
            }

            return receiptContext;
        },

        getOrderCourseKey: function (order) {
            var length, items;
            if (this.useEcommerceApi) {
                length = order.lines.length;
                for (var i = 0; i < length; i++) {
                    var line = order.lines[i],
                        attributeValues = _.find(line.product.attribute_values, function (attribute) {
                            // If the attribute has a 'code' property, compare its value, otherwise compare 'name'
                            var value_to_match = 'course_key';
                            if (attribute.code) {
                                return attribute.code === value_to_match;
                            } else {
                                return attribute.name === value_to_match;
                            }
                        });

                    // This method assumes that all items in the order are related to a single course.
                    if (attributeValues != undefined) {
                        return attributeValues['value'];
                    }
                }
            } else {
                items = _.filter(order.items, function (item) {
                    return item.course_key;
                });

                if (items.length > 0) {
                    return items[0].course_key;
                }
            }

            return null;
        },

        formatMoney: function (moneyStr) {
            return Number(moneyStr).toFixed(2);
        },

        /**
         * Check whether the payment is for the credit course or not.
         *
         * @param  {object} order Receipt data received from the server
         * @return {string} String of the provider_id or null.
         */
        getCreditProviderId: function (order) {
            var attributeValues,
                line = order.lines[0];
            if (this.useEcommerceApi) {
                attributeValues = _.find(line.product.attribute_values, function (attribute) {
                    return attribute.name === 'credit_provider';
                });

                // This method assumes that all items in the order are related to a single course.
                if (attributeValues != undefined) {
                    return attributeValues['value'];
                }
            }

            return null;
        }


    });

});     // jshint ignore:line

function createCreditRequest (providerId, courseKey, username) {
    return $.ajax({
        url: $('#receipt-container').data('lms-url') + '/api/credit/v1/providers/' + providerId + '/request/',
        type: 'POST',
        headers: {
            'X-CSRFToken': $.cookie('csrftoken')
        },
        dataType: 'json',
        contentType: 'application/json',
        data: JSON.stringify({
            'course_key': courseKey,
            'username': username
        }),
        context: this,
        success: function (requestData) {
            var $form = $('<form>', {
                'class': 'hidden',
                'action': requestData.url,
                'method': 'POST',
                'accept-method': 'UTF-8'
            });

            _.each(requestData.parameters, function (value, key) {
                $('<textarea>').attr({
                    name: key,
                    value: value
                }).appendTo($form);
            });

            $form.appendTo('body').submit();
        }
    });
}

function completeOrder(event) {     // jshint ignore:line
    var courseKey = $(event).data("course-key"),
        username = $(event).data("username"),
        providerId = $(event).data("provider"),
        $errorContainer = $("#error-container");

    try {
        event.preventDefault();
    } catch (err) {
        // Ignore the error as not all event inputs have the preventDefault method.
    }

    analytics.track(
        "edx.bi.credit.clicked_complete_credit",
        {
            category: "credit",
            label: courseKey
        }
    );

    createCreditRequest(providerId, courseKey, username).fail(function () {
        $errorContainer.removeClass("hidden");
    });
}
