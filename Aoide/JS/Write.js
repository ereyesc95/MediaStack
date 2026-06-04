//Generate fields on change
$('#selectDBTable').on("change", function () {
    //Clear div
    $('#fieldContainer').empty();
    var TableName = $(this).val();
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/Write.aspx/GetTableColumns",
        data: JSON.stringify({
            'strTableName': TableName
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            //Insert HTML string
            $('#fieldContainer').append(data.d);
        }
    });
});

//Clear Data
$('#writeClear').on("click", function () {
    $(".wrtField").val("");
});

//Retrieve data
$('#writeRetrieve').on("click", function () {
    //Variable setup
    var arrFieldID = new Array($(".wrtField").length);
    var arrFieldVal = new Array($(".wrtField").length);
    $('#fieldContainer').html = "";

    for (var i = 1; i <= $(".wrtField").length; i++) {
        arrFieldID[i] = $("#wrtField" + i).attr("data-value");
        arrFieldVal[i] = $("#wrtField" + i).val();
    }

    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/Write.aspx/RetrieveData",
        data: JSON.stringify({
            'strFieldID': JSON.stringify(arrFieldID),
            'strFieldVal': JSON.stringify(arrFieldVal),
            'strTableName': $('#selectDBTable').val(),
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            $('#fieldContainer').empty().append(data.d);
        }
    });
});

//Update data
$('#writeUpdate').on("click", function () {

    //Variable setup
    var arrFieldID = new Array($(".wrtField").length);
    var arrFieldVal = new Array($(".wrtField").length);
    $('#fieldContainer').html = "";

    for (var i = 1; i <= $(".wrtField").length; i++) {
        if ($("#wrtField" + i).val() != "") {
            arrFieldID[i] = $("#wrtField" + i).attr("data-value");
            arrFieldVal[i] = $("#wrtField" + i).val();
        }
    }

    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/Write.aspx/UpdateData",
        data: JSON.stringify({
            'strFieldID': JSON.stringify(arrFieldID),
            'strFieldVal': JSON.stringify(arrFieldVal),
            'strTableName': $('#selectDBTable').val(),
            'strRecordId': $("#wrtField0").val(),
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            alert("Data Updated");
            $('#fieldContainer').empty();
            $('#selectDBTable').val($('#selectDBTable option:first').val());
        }
    });
});

//Submit data
$('#writeSubmit').on("click", function () {
    //Variable setup
    var arrFieldID = new Array($(".wrtField").length);
    var arrFieldVal = new Array($(".wrtField").length);
    $('#fieldContainer').html = "";

    for (var i = 1; i <= $(".wrtField").length; i++) {
        arrFieldID[i] = $("#wrtField" + i).attr("data-value");
        arrFieldVal[i] = $("#wrtField" + i).val();
    }

    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/Write.aspx/SubmitData",
        data: JSON.stringify({
            'strFieldID': JSON.stringify(arrFieldID),
            'strFieldVal': JSON.stringify(arrFieldVal),
            'strTableName': $('#selectDBTable').val(),
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (data) {
            alert("Data Saved");
            $('#fieldContainer').empty();
            $('#selectDBTable').val($('#selectDBTable option:first').val());
        }
    });
});