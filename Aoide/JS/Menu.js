$('.button-menu').each(function () {
    $(this).css({
        "background-image": "url(/Images/System/but" + $(this).attr("data-value") + ".jpg)",
        "background-size": "cover",
        "background-position": "center top",
    });    
});

$('.button-menu').on("click", function () {
    var PageName = $(this).children(".button-span").attr("data-value");

    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/Home.aspx/DefineCurrentPage",
        data: JSON.stringify({
            'strPageID': $(this).attr("data-value"),
            'strPageName': $(this).children(".button-span").attr("data-value")
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function () {
            window.location.replace("/Media/" + PageName);
        }
    });
});